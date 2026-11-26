import Hero from './components/Hero';
import Work from './components/Work';
import Contact from './components/Contact';
import SiteShell from './components/SiteShell';
import { Clients, Stats, Services, Engagements, Process, FAQ, Worldwide } from './components/Sections';

export default function App() {
  return (
    <SiteShell home>
      <Hero />
      <Clients />
      <Stats />
      <Services />
      <Work />
      <Engagements />
      <Process />
      <FAQ />
      <Worldwide />
      <Contact />
    </SiteShell>
  );
}
