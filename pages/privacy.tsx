import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/legal.module.css';

export default function PrivacyPage() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) setDark(saved === 'dark');
  }, []);

  return (
    <div className={styles.container} style={{ colorScheme: dark ? 'dark' : 'light' }}>
      <main className={styles.content}>
        <h1>Privacy Policy</h1>

        <section>
          <h2>Overview</h2>
          <p>
            Runnit Back HQ is an internal content publishing tool that connects to your TikTok account.
            This privacy policy explains what data we collect, how we use it, and your rights to control it.
          </p>
        </section>

        <section>
          <h2>Data Collected</h2>
          <p>When you connect your TikTok account, we collect and store:</p>
          <ul>
            <li><strong>TikTok OAuth Token</strong> — Credentials needed to post content on your behalf</li>
            <li><strong>TikTok Profile Information</strong> — Your account handle, display name, and channel info</li>
            <li><strong>TikTok User ID</strong> — Unique identifier for your account</li>
            <li><strong>Approval History</strong> — Metadata about which content you approved or rejected</li>
          </ul>
        </section>

        <section>
          <h2>How Data Is Used</h2>
          <p>We use your data only for these purposes:</p>
          <ul>
            <li><strong>Posting Content</strong> — To publish approved video clips to your TikTok channel</li>
            <li><strong>Account Connection</strong> — To verify and maintain your TikTok authorization</li>
            <li><strong>Approval Interface</strong> — To display your account info in the app for content review</li>
            <li><strong>Audit Trail</strong> — To record which operator approved or rejected each piece of content</li>
          </ul>
        </section>

        <section>
          <h2>TikTok Data Usage</h2>
          <p>
            <strong>Important:</strong> We use the TikTok Content Posting API and OAuth authorization flow.
            This means:
          </p>
          <ul>
            <li>Your TikTok OAuth token is sent to TikTok's servers when we post content</li>
            <li>TikTok may process metadata about your account and posting activity</li>
            <li>Refer to <a href="https://www.tiktok.com/privacy" target="_blank" rel="noopener noreferrer">TikTok's Privacy Policy</a> for their data practices</li>
            <li>We do not sell or share your TikTok data with third parties</li>
          </ul>
        </section>

        <section>
          <h2>Data Storage & Security</h2>
          <ul>
            <li>OAuth tokens are stored encrypted in our secure database</li>
            <li>Access to your token is restricted to posting operations only</li>
            <li>Tokens are never logged, displayed, or exported in plain text</li>
            <li>All data is stored on secure servers with access controls</li>
          </ul>
        </section>

        <section>
          <h2>User Control & Revocation</h2>
          <p>
            You have full control over your data and can disconnect your TikTok account at any time:
          </p>
          <ul>
            <li><strong>Disconnect Account</strong> — From your account settings, disconnect Runnit Back HQ from your TikTok</li>
            <li><strong>Revoke OAuth Access</strong> — Go to TikTok Settings → Apps & Websites → Remove Runnit Back HQ</li>
            <li><strong>Data Deletion</strong> — Disconnecting will remove your OAuth token from our database</li>
            <li><strong>Approval History</strong> — Historical approvals may be retained for audit purposes (anonymized upon request)</li>
          </ul>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>
            <strong>TikTok API:</strong> We use TikTok's official Content Posting API and OAuth service to post content.
            Your data is shared with TikTok to enable posting functionality.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions or data access requests, contact: <strong>support@runnit.local</strong>
          </p>
        </section>

        <section className={styles.footer}>
          <Link href="/terms">Terms of Service</Link>
          <span>•</span>
          <Link href="/">Back to App</Link>
        </section>
      </main>
    </div>
  );
}
