import Dashboard from '@/containers/dashboard/dashboard';
import Image from "next/image";
import styles from "./home.module.css";
import { Navbar } from "@/components";
import { Hero, Bands } from "@/containers";

export const metadata = {
  title: 'KF8FVD — Amateur Radio',
  description: 'KF8FVD — Ham radio operator in Kentwood, MI. Browse bands, equipment, and projects.',
  openGraph: {
    title: 'KF8FVD — Amateur Radio',
    description: 'KF8FVD — Ham radio operator in Kentwood, MI. Browse bands, equipment, and projects.',
    images: ['/grand_rapids.jpg'],
  },
  twitter: { card: 'summary_large_image' }
}

export default function Home() {
  return (
    <div className={styles.page}>
      <main id="main" className={styles.main}>
        <Hero />
           <Dashboard />
        <Bands />
      </main>
    </div>
  );
}
