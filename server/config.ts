// Server configuration, read once from the environment and validated.
//
// Every secret is read here and nowhere else, on the server only. Nothing in
// this file is reachable from the browser bundle: Vite only exposes VITE_*
// variables, and this project defines none.

import { z } from 'zod';
import { emailInDomain } from '../shared/email.ts';

const ROLES = ['super_admin', 'admin', 'employee'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

const teamUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['admin', 'employee']),
});
export type TeamUserSeed = z.infer<typeof teamUserSchema>;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),

    GOOGLE_SHEETS_SPREADSHEET_ID: z.string().trim().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().trim().optional(),
    /**
     * Local development only: keep data in memory instead of Sheets. Refused in
     * production, where every piece of state must live in Sheets.
     */
    SHEETS_BACKEND: z.enum(['google', 'memory']).default('google'),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    /** Only addresses on exactly this domain may have accounts or sign in. */
    ALLOWED_EMAIL_DOMAIN: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'must be a bare domain like azumco.com')
      .default('azumco.com'),
    SUPERADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    SUPERADMIN_NAME: z.string().trim().min(1).default('Super Admin'),
    /** Used only to create the super_admin the first time; ignored afterwards. */
    SUPERADMIN_INITIAL_PASSWORD: z.string().min(12).optional(),
    /** JSON array of { name, email, role } for the other team members. */
    TEAM_USERS: z.string().default('[]'),

    /** Optional; the Places finder disables itself when absent (Phase 3). */
    GOOGLE_PLACES_API_KEY: z.string().trim().optional(),
    /** Bearer token for the scheduled-maintenance endpoint. */
    CRON_TOKEN: z.string().min(32).optional(),

    /**
     * Staging runs only: use STAGING_SPREADSHEET_ID instead of the production
     * sheet, and optionally shorten assignment timers to minutes. Refused on
     * Render (RENDER is set there) and when the two ids are the same, so it can
     * never be switched on in production.
     */
    STAGING_MODE: z.enum(['true', 'false']).default('false'),
    STAGING_SPREADSHEET_ID: z.string().trim().optional(),
    STAGING_ASSIGNMENT_MINUTES: z.coerce.number().int().min(1).max(180).optional(),
    /** Set by Render on every service. Used only to refuse staging mode there. */
    RENDER: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (!emailInDomain(env.SUPERADMIN_EMAIL, env.ALLOWED_EMAIL_DOMAIN)) {
      ctx.addIssue({ code: 'custom', path: ['SUPERADMIN_EMAIL'], message: `must be an address on ${env.ALLOWED_EMAIL_DOMAIN}` });
    }
    if (env.STAGING_MODE === 'true') {
      if (env.RENDER) ctx.addIssue({ code: 'custom', path: ['STAGING_MODE'], message: 'staging mode cannot be used on Render' });
      if (!env.STAGING_SPREADSHEET_ID) ctx.addIssue({ code: 'custom', path: ['STAGING_SPREADSHEET_ID'], message: 'required in staging mode' });
      else if (env.STAGING_SPREADSHEET_ID === env.GOOGLE_SHEETS_SPREADSHEET_ID)
        ctx.addIssue({ code: 'custom', path: ['STAGING_SPREADSHEET_ID'], message: 'must differ from GOOGLE_SHEETS_SPREADSHEET_ID' });
    } else if (env.STAGING_ASSIGNMENT_MINUTES !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['STAGING_ASSIGNMENT_MINUTES'], message: 'only allowed with STAGING_MODE=true' });
    }
    if (env.SHEETS_BACKEND === 'memory' && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['SHEETS_BACKEND'], message: 'memory backend is not allowed in production' });
    }
    if (env.SHEETS_BACKEND === 'google') {
      if (!env.GOOGLE_SHEETS_SPREADSHEET_ID)
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_SHEETS_SPREADSHEET_ID'], message: 'required' });
      if (!env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'], message: 'required' });
    }
  });

export type Config = z.infer<typeof envSchema> & {
  teamUsers: TeamUserSeed[];
  isProduction: boolean;
  /** The spreadsheet this process reads and writes. */
  activeSpreadsheetId: string | undefined;
  /** Assignment timer override in minutes — staging only, else null. */
  assignmentOverrideMinutes: number | null;
};

/**
 * Parse and validate the environment. Throws with a list of problems — names
 * only, never values, so a misconfigured deploy cannot print a secret.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  let rawTeam: unknown;
  try {
    rawTeam = JSON.parse(parsed.data.TEAM_USERS);
  } catch {
    throw new Error('Invalid environment configuration:\n  - TEAM_USERS: not valid JSON');
  }
  const team = z.array(teamUserSchema).safeParse(rawTeam);
  if (!team.success) {
    throw new Error('Invalid environment configuration:\n  - TEAM_USERS: expected [{ name, email, role: "admin"|"employee" }]');
  }

  // Name entries by position only — never print an address.
  const outside = team.data
    .map((u, i) => (emailInDomain(u.email, parsed.data.ALLOWED_EMAIL_DOMAIN) ? 0 : i + 1))
    .filter((i) => i > 0);
  if (outside.length) {
    throw new Error(
      `Invalid environment configuration:\n  - TEAM_USERS: entr${outside.length === 1 ? 'y' : 'ies'} ${outside.join(', ')} must use an address on ${parsed.data.ALLOWED_EMAIL_DOMAIN}`,
    );
  }
  const emails = team.data.map((u) => u.email);
  if (new Set(emails).size !== emails.length || emails.includes(parsed.data.SUPERADMIN_EMAIL)) {
    throw new Error('Invalid environment configuration:\n  - TEAM_USERS: each email must be unique and differ from SUPERADMIN_EMAIL');
  }

  const staging = parsed.data.STAGING_MODE === 'true';
  return {
    ...parsed.data,
    teamUsers: team.data,
    isProduction: parsed.data.NODE_ENV === 'production',
    activeSpreadsheetId: staging ? parsed.data.STAGING_SPREADSHEET_ID : parsed.data.GOOGLE_SHEETS_SPREADSHEET_ID,
    assignmentOverrideMinutes: staging ? (parsed.data.STAGING_ASSIGNMENT_MINUTES ?? null) : null,
  };
}
