import Image from "next/image";
import styles from "./home.module.css";
import { Navbar } from "@/components";
import { Hero, Bands } from "@/containers";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Hero />
        <Bands />
      </main>
    </div>
  );
}
