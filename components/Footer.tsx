import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <Link href="/privacy">Privacy Policy</Link>
        <span>•</span>
        <Link href="/terms">Terms of Service</Link>
      </div>
      <p className={styles.copyright}>
        © 2025 Runnit Back HQ. TikTok is a trademark of TikTok Inc.
      </p>
    </footer>
  );
}
