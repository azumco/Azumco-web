import React, { useState, useEffect, useMemo } from 'react';
import {
  initializeAuth,
  browserLocalPersistence,
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  Search,
  Sliders,
  Shield,
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Phone,
  Globe,
  Star,
  Copy,
  RefreshCw,
  LogOut,
  Sparkles,
  Lock,
  EyeOff,
  Filter,
  Check,
  ChevronDown
} from 'lucide-react';
import { NotFoundPage } from './NotFoundPage';

export const ESTIMATED_COST_PER_SEARCH_USD = 0.035;
export const COST_LABEL = '[UNVERIFIED - CHECK GOOGLE CLOUD BILLING TARIFFS]';
export const DAILY_SEARCH_CAP_DEFAULT = 20;

const MP_CITIES = [
  'Indore',
  'Bhopal',
  'Jabalpur',
  'Gwalior',
  'Ujjain',
  'Sagar',
  'Dewas',
  'Satna',
  'Ratlam',
  'Rewa',
  'Katni',
  'Singrauli',
  'Burhanpur',
  'Khandwa',
  'Morena',
  'Bhind',
  'Chhindwara',
  'Guna',
  'Shivpuri',
  'Vidisha'
];

const HIGH_TICKET_CATEGORIES = [
  'Dental & Aesthetic Clinics',
  'Interior Designers & Architects',
  'Specialized Coaching & Academies',
  'B2B Manufacturers & Distributors',
  'High-End Spas & Salons',
  'Real Estate Developers & Builders',
  'Luxury Automobile Dealerships & Detailers',
  'Law Firms & Tax Consultants',
  'Event & Wedding Planners',
  'Custom Modular Furniture & Kitchens'
];

export interface LeadItem {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  mapsUrl: string;
  rating: number | null;
  userRatingCount: number | null;
  website: string | null;
  phone: string | null;
  fetchedAt: number;
  // Manual Signals
  unclaimedListing?: boolean;
  missingHoursOrPhone?: boolean;
  fewerThanThreePhotos?: boolean;
  socialFollowers?: number | null;
  socialLastPostDaysAgo?: number | null;
  // Audit Health
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  healthDetails?: string;
  // Workflow
  status: 'new' | 'contacted' | 'replied' | 'won' | 'not_a_fit';
  notes: string;
  doNotContact: boolean;
  suggestedMessage?: string;
}

function getStoredLeads(): Record<string, LeadItem> {
  try {
    const raw = localStorage.getItem('azumco_lead_finder_vault_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredLeads(leads: Record<string, LeadItem>) {
  try {
    localStorage.setItem('azumco_lead_finder_vault_v1', JSON.stringify(leads));
  } catch {
    // quota exceeded or storage blocked
  }
}

export function LeadFinderDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Search state
  const [stateName, setStateName] = useState('Madhya Pradesh');
  const [city, setCity] = useState('Indore');
  const [category, setCategory] = useState(HIGH_TICKET_CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Daily Usage state
  const [usage, setUsage] = useState({ count: 0, cap: DAILY_SEARCH_CAP_DEFAULT, remaining: DAILY_SEARCH_CAP_DEFAULT });

  // Leads state
  const [searchResults, setSearchResults] = useState<LeadItem[]>([]);
  const [savedLeadsMap, setSavedLeadsMap] = useState<Record<string, LeadItem>>(getStoredLeads);
  const [activeTab, setActiveTab] = useState<'search' | 'saved' | 'dnc'>('search');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generatingOutreachId, setGeneratingOutreachId] = useState<string | null>(null);
  const [auditingHealthId, setAuditingHealthId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let metaTag = document.querySelector('meta[name="robots"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'robots');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', 'noindex, nofollow');
  }, []);

  useEffect(() => {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyPlaceholderConfigForClientInit',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'azumco-app.firebaseapp.com',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'azumco-app',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'azumco-app.appspot.com',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef'
    };

    let app;
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }

    let auth;
    try {
      auth = getAuth(app);
    } catch {
      auth = initializeAuth(app, {
        persistence: browserLocalPersistence
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          // Test with backend to verify allowlist
          const res = await fetch('/api/lead-finder/usage', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCurrentUser(user);
            setIdToken(token);
            setUsage(data);
            setAuthError(null);
          } else {
            setAuthError('Access denied: Your Google account is not on the authorized allowlist.');
            await signOut(auth);
            setCurrentUser(null);
            setIdToken(null);
          }
        } catch (err: any) {
          setAuthError('Authentication verification failed.');
          setCurrentUser(null);
          setIdToken(null);
        }
      } else {
        setCurrentUser(null);
        setIdToken(null);
      }
      setAuthInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const app = getApps()[0];
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      const res = await fetch('/api/lead-finder/usage', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Unauthorized: Email not on authorized allowlist');
      }
      const data = await res.json();
      setCurrentUser(result.user);
      setIdToken(token);
      setUsage(data);
      setShowLoginModal(false);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    }
  };

  const handleSignOut = async () => {
    const app = getApps()[0];
    const auth = getAuth(app);
    await signOut(auth);
    setCurrentUser(null);
    setIdToken(null);
  };

  const calculateLeadScore = (lead: LeadItem): { score: number; reasons: string[] } => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Website Status (Max 30 pts)
    if (!lead.website) {
      score += 25;
      reasons.push('No website listed on Google profile (+25)');
    } else if (lead.healthStatus === 'unhealthy') {
      score += 20;
      reasons.push(`Website audit failed: ${lead.healthDetails || 'Offline/Errors'} (+20)`);
    }

    // 2. Unclaimed GBP (20 pts)
    if (lead.unclaimedListing) {
      score += 20;
      reasons.push('Unclaimed Google Business Profile (+20)');
    }

    // 3. Missing hours or phone (15 pts)
    if (lead.missingHoursOrPhone) {
      score += 15;
      reasons.push('Missing hours or phone number (+15)');
    } else if (!lead.phone) {
      score += 10;
      reasons.push('No contact phone listed on Places (+10)');
    }

    // 4. Low reviews or rating (Max 20 pts)
    if (lead.userRatingCount !== null) {
      if (lead.userRatingCount < 15) {
        score += 10;
        reasons.push(`Low review volume: only ${lead.userRatingCount} reviews (+10)`);
      }
    } else {
      reasons.push('Review count: unknown');
    }

    if (lead.rating !== null) {
      if (lead.rating < 4.2) {
        score += 10;
        reasons.push(`Sub-par rating: ${lead.rating}/5 stars (+10)`);
      }
    } else {
      reasons.push('Rating: unknown');
    }

    // 5. Fewer than 3 photos (10 pts)
    if (lead.fewerThanThreePhotos) {
      score += 10;
      reasons.push('Fewer than 3 photos on listing (+10)');
    }

    // 6. Social Media dormancy (10 pts)
    if (lead.socialLastPostDaysAgo !== null && lead.socialLastPostDaysAgo !== undefined) {
      if (lead.socialLastPostDaysAgo > 60) {
        score += 10;
        reasons.push(`Inactive social media (last post ${lead.socialLastPostDaysAgo}d ago) (+10)`);
      }
    }

    // 7. High-ticket category fit (10 pts)
    score += 10;
    reasons.push('High-ticket client acquisition fit (+10)');

    return {
      score: Math.min(100, Math.max(0, score)),
      reasons
    };
  };

  const handleSearch = async () => {
    if (!idToken) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch('/api/lead-finder/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          query: searchQuery,
          city,
          state: stateName,
          category
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Search failed with status ${res.status}`);
      }

      const data = await res.json();
      setUsage(data.usage);

      const mapped: LeadItem[] = (data.results || []).map((raw: any) => {
        const existing = savedLeadsMap[raw.placeId];
        if (existing) {
          return {
            ...raw,
            ...existing,
            fetchedAt: raw.fetchedAt || existing.fetchedAt
          };
        }
        return {
          placeId: raw.placeId,
          name: raw.name,
          address: raw.address,
          types: raw.types || [],
          mapsUrl: raw.mapsUrl,
          rating: raw.rating,
          userRatingCount: raw.userRatingCount,
          website: raw.website,
          phone: raw.phone,
          fetchedAt: raw.fetchedAt || Date.now(),
          status: 'new',
          notes: '',
          doNotContact: false
        };
      });

      setSearchResults(mapped);
    } catch (err: any) {
      setSearchError(err.message || 'Error executing search');
    } finally {
      setIsSearching(false);
    }
  };

  const updateLeadItem = (placeId: string, partial: Partial<LeadItem>) => {
    setSearchResults(prev =>
      prev.map(item => (item.placeId === placeId ? { ...item, ...partial } : item))
    );

    setSavedLeadsMap(prev => {
      const existing = prev[placeId] || searchResults.find(s => s.placeId === placeId);
      if (!existing) return prev;
      const updated = { ...existing, ...partial };
      const nextMap = { ...prev, [placeId]: updated };
      saveStoredLeads(nextMap);
      return nextMap;
    });
  };

  const runWebsiteAudit = async (lead: LeadItem) => {
    if (!lead.website || !idToken) return;
    setAuditingHealthId(lead.placeId);

    try {
      const res = await fetch('/api/lead-finder/health-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ url: lead.website })
      });
      const data = await res.json();
      if (data.isValid) {
        updateLeadItem(lead.placeId, {
          healthStatus: 'healthy',
          healthDetails: `Status ${data.status} (${data.responseTimeMs}ms), Mobile: ${data.hasMobileViewport ? 'Yes' : 'No'}`
        });
      } else {
        updateLeadItem(lead.placeId, {
          healthStatus: 'unhealthy',
          healthDetails: data.error || `HTTP ${data.status || 'Error'}`
        });
      }
    } catch (err: any) {
      updateLeadItem(lead.placeId, {
        healthStatus: 'unhealthy',
        healthDetails: err.message || 'Audit connection failed'
      });
    } finally {
      setAuditingHealthId(null);
    }
  };

  const generateOutreach = async (lead: LeadItem) => {
    if (!idToken) return;
    setGeneratingOutreachId(lead.placeId);
    const { reasons } = calculateLeadScore(lead);

    try {
      const res = await fetch('/api/lead-finder/outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          business: {
            name: lead.name,
            category,
            website: lead.website,
            rating: lead.rating,
            reasons
          }
        })
      });
      const data = await res.json();
      if (data.message) {
        updateLeadItem(lead.placeId, { suggestedMessage: data.message });
      }
    } catch {
      // fallback handled in leadFinderCore
    } finally {
      setGeneratingOutreachId(null);
    }
  };

  const savedLeadsList = useMemo<LeadItem[]>(() => Object.values(savedLeadsMap), [savedLeadsMap]);

  const exportCsv = () => {
    const leadsToExport = savedLeadsList.filter(l => !l.doNotContact);
    if (!leadsToExport.length) return;

    const headers = [
      'Name',
      'Address',
      'Phone',
      'Website',
      'Rating',
      'ReviewCount',
      'Score',
      'Status',
      'Notes',
      'MapsUrl',
      'Unclaimed',
      'FetchedDate'
    ];

    const rows = leadsToExport.map(l => {
      const { score } = calculateLeadScore(l);
      return [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.address || '').replace(/"/g, '""')}"`,
        `"${(l.phone || '').replace(/"/g, '""')}"`,
        `"${(l.website || '').replace(/"/g, '""')}"`,
        l.rating !== null ? l.rating : 'unknown',
        l.userRatingCount !== null ? l.userRatingCount : 'unknown',
        score,
        l.status,
        `"${(l.notes || '').replace(/"/g, '""')}"`,
        `"${(l.mapsUrl || '').replace(/"/g, '""')}"`,
        l.unclaimedListing ? 'Yes' : 'No',
        new Date(l.fetchedAt).toISOString().split('T')[0]
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Azumco_Saved_Leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If unauthenticated or no session, show authentic 404 page with subtle admin gate
  if (!authInitialized || !currentUser || !idToken) {
    return (
      <div className="relative">
        <NotFoundPage />
        {/* Discrete Admin unlock gate */}
        <div className="fixed bottom-3 right-3 opacity-30 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-1.5 text-[10px] font-mono text-[#525B66] bg-[#121417] px-2.5 py-1 rounded border border-[#22262B] hover:text-[#FF6A00] hover:border-[#FF6A00]/40 transition-colors"
          >
            <Lock className="w-3 h-3" />
            <span>SYS_LOGIN</span>
          </button>
        </div>

        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121417] border border-[#2B3037] rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs uppercase tracking-wider text-[#868E96]">
                  AZUMCO INTERNAL PORTAL
                </span>
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="text-[#868E96] hover:text-white text-xs font-mono"
                >
                  ESC
                </button>
              </div>

              <h2 className="text-lg font-bold text-white mb-2">Admin Identity Verification</h2>
              <p className="text-xs text-[#868E96] mb-6 leading-relaxed">
                Sign in with the authorized Google Workspace account. Access is restricted to pre-approved administrator email addresses.
              </p>

              {authError && (
                <div className="mb-4 p-3 rounded-lg bg-[#FA5252]/10 border border-[#FA5252]/30 text-xs text-[#FA5252]">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-neutral-100 text-neutral-900 font-medium py-2.5 px-4 rounded-xl text-xs transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Sign in with Google
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const leadsDisplayList = useMemo(() => {
    if (activeTab === 'search') {
      return searchResults.filter(l => !l.doNotContact);
    }
    if (activeTab === 'dnc') {
      return savedLeadsList.filter(l => l.doNotContact);
    }
    return savedLeadsList
      .filter(l => !l.doNotContact)
      .filter(l => (statusFilter === 'all' ? true : l.status === statusFilter));
  }, [activeTab, searchResults, savedLeadsList, statusFilter]);

  return (
    <div className="min-h-screen bg-[#08090B] text-[#F2F3F4] selection:bg-[#FF6A00] selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-[#22262B] bg-[#121417]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FF6A00]/10 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF6A00] font-mono font-bold text-xs">
              AZ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-white tracking-wider">LEAD VAULT</span>
                <span className="text-[10px] font-mono bg-[#1E232A] text-[#868E96] px-1.5 py-0.5 rounded">
                  v1.2 // PRIVATE
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#868E96]">Azumco Local Business Lead Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs font-mono bg-[#181B1F] border border-[#2B3037] px-3 py-1.5 rounded-lg">
              <span className="text-[#868E96]">Daily Quota:</span>
              <span className={`font-bold ${usage.remaining === 0 ? 'text-[#FA5252]' : 'text-[#40C057]'}`}>
                {usage.remaining} / {usage.cap} left
              </span>
            </div>

            <div className="flex items-center gap-2 border-l border-[#2B3037] pl-4">
              <span className="text-xs font-mono text-[#868E96] hidden sm:inline">
                {currentUser.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="p-1.5 rounded-lg text-[#868E96] hover:text-white hover:bg-[#1E232A] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Search Parameter Card */}
        <section className="bg-[#121417] border border-[#22262B] rounded-2xl p-6 mb-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-[#FF6A00]" />
              <h2 className="text-sm font-bold uppercase font-mono tracking-wider text-white">
                Places API (New) Query Generator
              </h2>
            </div>
            {/* Cost Estimate Pill */}
            <div className="text-[11px] font-mono bg-[#181B1F] border border-[#2B3037] px-3 py-1 rounded-md text-[#FF6A00] flex items-center gap-1.5">
              <span>Cost per search: ~${ESTIMATED_COST_PER_SEARCH_USD.toFixed(3)}</span>
              <span className="text-[9px] text-[#868E96]">{COST_LABEL}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-mono text-[#868E96] mb-1.5 uppercase">State</label>
              <select
                value={stateName}
                onChange={e => setStateName(e.target.value)}
                className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-2.5 focus:border-[#FF6A00] outline-none"
              >
                <option value="Madhya Pradesh">Madhya Pradesh (Default)</option>
                <option value="Maharashtra">Maharashtra</option>
                <option value="Gujarat">Gujarat</option>
                <option value="Delhi NCR">Delhi NCR</option>
                <option value="Karnataka">Karnataka</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#868E96] mb-1.5 uppercase">City</label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-2.5 focus:border-[#FF6A00] outline-none"
              >
                {MP_CITIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#868E96] mb-1.5 uppercase">High-Ticket Niche</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-2.5 focus:border-[#FF6A00] outline-none"
              >
                {HIGH_TICKET_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#868E96] mb-1.5 uppercase">Free-Text Modifier</label>
              <input
                type="text"
                placeholder="e.g. clinic, luxury, bypass road"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-2.5 focus:border-[#FF6A00] outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#22262B]">
            <span className="text-[11px] font-mono text-[#868E96]">
              Query: <span className="text-white">"{[searchQuery, category, city, stateName].filter(Boolean).join(' ')}"</span>
            </span>

            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching || usage.remaining <= 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FF6A00] hover:bg-[#e55f00] disabled:opacity-40 text-white font-mono text-xs font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_15px_rgba(255,106,0,0.3)]"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>FETCHING VIA PLACES API...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>RUN DISCOVERY SEARCH</span>
                </>
              )}
            </button>
          </div>

          {searchError && (
            <div className="mt-4 p-3 rounded-xl bg-[#FA5252]/10 border border-[#FA5252]/30 text-xs text-[#FA5252] flex items-center gap-2 font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}
        </section>

        {/* View Tabs & CSV Export Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 bg-[#121417] p-1 rounded-xl border border-[#22262B]">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`text-xs font-mono px-3.5 py-1.5 rounded-lg transition-colors ${
                activeTab === 'search' ? 'bg-[#FF6A00] text-white font-bold' : 'text-[#868E96] hover:text-white'
              }`}
            >
              Search Results ({searchResults.filter(l => !l.doNotContact).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`text-xs font-mono px-3.5 py-1.5 rounded-lg transition-colors ${
                activeTab === 'saved' ? 'bg-[#FF6A00] text-white font-bold' : 'text-[#868E96] hover:text-white'
              }`}
            >
              Saved Leads ({savedLeadsList.filter(l => !l.doNotContact).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dnc')}
              className={`text-xs font-mono px-3.5 py-1.5 rounded-lg transition-colors ${
                activeTab === 'dnc' ? 'bg-[#22262B] text-[#FA5252] font-bold' : 'text-[#868E96] hover:text-white'
              }`}
            >
              Do Not Contact ({savedLeadsList.filter(l => l.doNotContact).length})
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {activeTab === 'saved' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-[#121417] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-1.5 font-mono outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="won">Won</option>
                <option value="not_a_fit">Not a fit</option>
              </select>
            )}

            <button
              type="button"
              onClick={exportCsv}
              disabled={savedLeadsList.filter(l => !l.doNotContact).length === 0}
              className="inline-flex items-center gap-2 text-xs font-mono font-medium bg-[#181B1F] hover:bg-[#22262B] border border-[#2B3037] text-white px-3.5 py-1.5 rounded-xl disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>EXPORT CSV</span>
            </button>
          </div>
        </div>

        {/* Lead List Cards */}
        {leadsDisplayList.length === 0 ? (
          <div className="bg-[#121417] border border-[#22262B] rounded-2xl p-12 text-center">
            <Filter className="w-8 h-8 text-[#525B66] mx-auto mb-3" />
            <p className="text-sm text-[#868E96] font-mono mb-2">No leads to display</p>
            <p className="text-xs text-[#525B66]">
              {activeTab === 'search'
                ? 'Run a discovery search using the controls above to fetch Places API records.'
                : 'Save leads from search results to manage them in your pipeline.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {leadsDisplayList.map(lead => {
              const { score, reasons } = calculateLeadScore(lead);
              const isSaved = !!savedLeadsMap[lead.placeId];

              return (
                <div
                  key={lead.placeId}
                  className={`border rounded-2xl p-5 transition-all ${
                    lead.doNotContact
                      ? 'bg-[#121417]/50 border-[#FA5252]/30 opacity-70'
                      : 'bg-[#121417] border-[#22262B] hover:border-[#343A40]'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
                    {/* Business Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <h3 className="text-base font-bold text-white font-sans">{lead.name}</h3>
                        {lead.mapsUrl && (
                          <a
                            href={lead.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#868E96] hover:text-[#FF6A00] transition-colors"
                            title="View on Google Maps [Source: Places API]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <span className="text-[10px] font-mono bg-[#1E232A] text-[#868E96] px-2 py-0.5 rounded">
                          Source: Places API
                        </span>
                      </div>

                      <p className="text-xs text-[#868E96] mb-2">{lead.address}</p>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        {lead.phone ? (
                          <span className="flex items-center gap-1.5 text-white">
                            <Phone className="w-3.5 h-3.5 text-[#FF6A00]" />
                            {lead.phone}
                          </span>
                        ) : (
                          <span className="text-[#FA5252] flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No phone listed
                          </span>
                        )}

                        {lead.website ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[#339AF0] hover:underline"
                            >
                              <Globe className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[200px]">{lead.website.replace(/^https?:\/\//, '')}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => runWebsiteAudit(lead)}
                              disabled={auditingHealthId === lead.placeId}
                              className="text-[10px] bg-[#1E232A] hover:bg-[#2B3037] text-[#CED4DA] px-2 py-0.5 rounded border border-[#343A40] transition-colors flex items-center gap-1"
                              title="Audit site health (Timeout, SSL, Mobile Viewport) via backend SSRF guard"
                            >
                              {auditingHealthId === lead.placeId ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Shield className="w-2.5 h-2.5 text-[#FF6A00]" />
                              )}
                              <span>Check Health</span>
                            </button>
                            {lead.healthStatus && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  lead.healthStatus === 'healthy'
                                    ? 'bg-[#40C057]/10 text-[#40C057] border border-[#40C057]/30'
                                    : 'bg-[#FA5252]/10 text-[#FA5252] border border-[#FA5252]/30'
                                }`}
                              >
                                {lead.healthDetails || lead.healthStatus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#FA5252] flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No website listed
                          </span>
                        )}

                        <div className="flex items-center gap-1 text-white">
                          <Star className="w-3.5 h-3.5 fill-[#FF6A00] text-[#FF6A00]" />
                          <span>{lead.rating !== null ? lead.rating : 'unknown'}</span>
                          <span className="text-[#868E96]">
                            ({lead.userRatingCount !== null ? `${lead.userRatingCount} reviews` : 'unknown'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Score Badge */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[11px] font-mono uppercase text-[#868E96]">Lead Opportunity</div>
                        <div
                          className={`text-2xl font-mono font-bold ${
                            score >= 60 ? 'text-[#FF6A00]' : score >= 40 ? 'text-[#FCC419]' : 'text-[#868E96]'
                          }`}
                        >
                          {score} / 100
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextSaved = !isSaved;
                          if (nextSaved) {
                            updateLeadItem(lead.placeId, { status: lead.status || 'new' });
                          } else {
                            const copy = { ...savedLeadsMap };
                            delete copy[lead.placeId];
                            setSavedLeadsMap(copy);
                            saveStoredLeads(copy);
                          }
                        }}
                        className={`text-xs font-mono px-3 py-2 rounded-xl border transition-colors ${
                          isSaved
                            ? 'bg-[#40C057]/10 border-[#40C057]/40 text-[#40C057]'
                            : 'bg-[#181B1F] border-[#2B3037] text-white hover:border-[#FF6A00]'
                        }`}
                      >
                        {isSaved ? 'SAVED' : '+ SAVE LEAD'}
                      </button>
                    </div>
                  </div>

                  {/* Manual Signals & Checkboxes */}
                  <div className="pt-3 border-t border-[#22262B] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                    <label className="flex items-center gap-2 cursor-pointer text-[#CED4DA] hover:text-white">
                      <input
                        type="checkbox"
                        checked={!!lead.unclaimedListing}
                        onChange={e => updateLeadItem(lead.placeId, { unclaimedListing: e.target.checked })}
                        className="rounded border-[#2B3037] bg-[#181B1F] text-[#FF6A00] focus:ring-0"
                      />
                      <span>Unclaimed GBP (Manual)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-[#CED4DA] hover:text-white">
                      <input
                        type="checkbox"
                        checked={!!lead.missingHoursOrPhone}
                        onChange={e => updateLeadItem(lead.placeId, { missingHoursOrPhone: e.target.checked })}
                        className="rounded border-[#2B3037] bg-[#181B1F] text-[#FF6A00] focus:ring-0"
                      />
                      <span>Missing hours / phone</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-[#CED4DA] hover:text-white">
                      <input
                        type="checkbox"
                        checked={!!lead.fewerThanThreePhotos}
                        onChange={e => updateLeadItem(lead.placeId, { fewerThanThreePhotos: e.target.checked })}
                        className="rounded border-[#2B3037] bg-[#181B1F] text-[#FF6A00] focus:ring-0"
                      />
                      <span>Fewer than 3 photos</span>
                    </label>
                  </div>

                  {/* Scoring Reasons Breakdown */}
                  <div className="mt-3 bg-[#181B1F] rounded-xl p-3 border border-[#262A30]">
                    <span className="text-[10px] font-mono uppercase text-[#868E96] block mb-1">
                      Scoring Factors Detected:
                    </span>
                    <ul className="text-xs text-[#CED4DA] space-y-0.5 list-disc list-inside">
                      {reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Pipeline Status, Notes & Outreach */}
                  <div className="mt-4 pt-4 border-t border-[#22262B] flex flex-col md:flex-row gap-4">
                    {/* Status Select */}
                    <div className="w-full md:w-48">
                      <label className="block text-[10px] font-mono text-[#868E96] uppercase mb-1">Pipeline Status</label>
                      <select
                        value={lead.status}
                        onChange={e => updateLeadItem(lead.placeId, { status: e.target.value as any })}
                        className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-2.5 py-1.5 font-mono outline-none"
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="replied">Replied</option>
                        <option value="won">Won</option>
                        <option value="not_a_fit">Not a Fit</option>
                      </select>
                    </div>

                    {/* Notes Field */}
                    <div className="flex-1">
                      <label className="block text-[10px] font-mono text-[#868E96] uppercase mb-1">Internal Notes</label>
                      <input
                        type="text"
                        placeholder="Owner name, pricing discussion, follow-up date..."
                        value={lead.notes || ''}
                        onChange={e => updateLeadItem(lead.placeId, { notes: e.target.value })}
                        className="w-full bg-[#181B1F] border border-[#2B3037] text-white text-xs rounded-xl px-3 py-1.5 focus:border-[#FF6A00] outline-none"
                      />
                    </div>

                    {/* Do Not Contact Toggle */}
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => updateLeadItem(lead.placeId, { doNotContact: !lead.doNotContact })}
                        className={`text-xs font-mono px-3 py-1.5 rounded-xl border transition-colors ${
                          lead.doNotContact
                            ? 'bg-[#FA5252] text-white border-[#FA5252]'
                            : 'bg-[#181B1F] border-[#2B3037] text-[#FA5252] hover:bg-[#FA5252]/10'
                        }`}
                      >
                        {lead.doNotContact ? 'DNC ACTIVE' : 'MARK DNC'}
                      </button>
                    </div>
                  </div>

                  {/* Suggested Outreach Message */}
                  <div className="mt-4 pt-3 border-t border-[#22262B]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase text-[#868E96] flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-[#FF6A00]" />
                        Suggested Outreach (Azumco Voice: Short, Plain, Value-Focused)
                      </span>
                      <button
                        type="button"
                        onClick={() => generateOutreach(lead)}
                        disabled={generatingOutreachId === lead.placeId}
                        className="text-[11px] font-mono text-[#FF6A00] hover:text-[#ff8124] transition-colors flex items-center gap-1"
                      >
                        {generatingOutreachId === lead.placeId ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>{lead.suggestedMessage ? 'Regenerate' : 'Generate Outreach'}</span>
                      </button>
                    </div>

                    {lead.suggestedMessage && (
                      <div className="bg-[#181B1F] border border-[#262A30] rounded-xl p-3 relative group">
                        <p className="text-xs text-[#E9ECEF] whitespace-pre-line font-sans leading-relaxed">
                          {lead.suggestedMessage}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(lead.suggestedMessage || '');
                            setCopiedId(lead.placeId);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="absolute top-2 right-2 text-xs font-mono bg-[#22262B] hover:bg-[#2B3037] text-white px-2 py-1 rounded-md opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                        >
                          {copiedId === lead.placeId ? <Check className="w-3 h-3 text-[#40C057]" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === lead.placeId ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
