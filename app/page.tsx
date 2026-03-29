import Dashboard from '@/containers/dashboard/dashboard';
import styles from "./home.module.css";
import { Hero, Bands, MainLogo } from "@/containers";
import { getSiteMediaUrl } from '@/lib/siteMedia';

export const metadata = {
  title: 'KF8FVD — Amateur Radio',
  description: 'KF8FVD — Ham radio operator in Kentwood, MI. Browse bands, equipment, and projects.',
  openGraph: {
    title: 'KF8FVD — Amateur Radio',
    description: 'KF8FVD — Ham radio operator in Kentwood, MI. Browse bands, equipment, and projects.',
    images: [getSiteMediaUrl('homeHero')],
  },
  twitter: { card: 'summary_large_image' }
}

export default function Home() {
  return (
    <div className={styles.page}>
      <main id="main" className={styles.main}>
        <Hero />
        <MainLogo />
        <Dashboard />
        <Bands />
      </main>
    </div>
  );
}
