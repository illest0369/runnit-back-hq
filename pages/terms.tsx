import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/legal.module.css';

export default function TermsPage() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) setDark(saved === 'dark');
  }, []);

  return (
    <div className={styles.container} style={{ colorScheme: dark ? 'dark' : 'light' }}>
      <main className={styles.content}>
        <h1>Terms of Service</h1>

        <section>
          <h2>1. Service Overview</h2>
          <p>
            Runnit Back HQ is an internal content publishing tool that connects to your TikTok account.
            It allows authorized operators to review, approve, and post video content to TikTok using the Content Posting API.
          </p>
          <p>
            <strong>Key principle:</strong> No content is posted automatically. A human operator must explicitly approve each piece of content before it goes to TikTok.
          </p>
        </section>

        <section>
          <h2>2. User Responsibilities</h2>
          <p>As an operator, you are responsible for:</p>
          <ul>
            <li><strong>Accurate Approvals</strong> — Only approve content that complies with TikTok's Community Guidelines and your brand standards</li>
            <li><strong>Account Security</strong> — Keep your login credentials secure and do not share access</li>
            <li><strong>Review Diligence</strong> — Review each clip carefully before approving</li>
            <li><strong>Compliance</strong> — Ensure all content meets legal and brand requirements before approval</li>
          </ul>
        </section>

        <section>
          <h2>3. Content Responsibility</h2>
          <p>
            <strong>You are responsible for all content you approve.</strong> By clicking "Approve":
          </p>
          <ul>
            <li>You confirm the content does not violate TikTok's Community Guidelines</li>
            <li>You have the rights to publish this content (music, visuals, talent, etc.)</li>
            <li>You accept legal responsibility for the published content</li>
            <li>You understand the content will be posted to your public TikTok channel</li>
          </ul>
          <p>
            Runnit Back HQ is a tool for managing the approval workflow — the publisher is legally responsible for the content.
          </p>
        </section>

        <section>
          <h2>4. TikTok Integration Disclaimer</h2>
          <p>
            This service uses TikTok's official Content Posting API and OAuth authorization. By using Runnit Back HQ:
          </p>
          <ul>
            <li>You agree to TikTok's Terms of Service and Community Guidelines</li>
            <li>You authorize us to post content to your TikTok account on your behalf</li>
            <li>TikTok may apply its own policies to your content (removal, age restriction, etc.)</li>
            <li>You understand TikTok's algorithm and policies may change at any time</li>
          </ul>
        </section>

        <section>
          <h2>5. Authorization & Access Revocation</h2>
          <p>
            You may revoke Runnit Back HQ's access to your TikTok account at any time:
          </p>
          <ul>
            <li>From the app: Click "Disconnect Account" in settings</li>
            <li>From TikTok: Go to Settings → Apps & Websites → Installed Apps → Remove Runnit Back HQ</li>
            <li>Immediately after revocation, the app can no longer post on your behalf</li>
          </ul>
        </section>

        <section>
          <h2>6. Limitation of Liability</h2>
          <p>
            Runnit Back HQ is provided as-is. We are not liable for:
          </p>
          <ul>
            <li>Content removed by TikTok for policy violations</li>
            <li>Account suspension or bans due to approved content</li>
            <li>Loss of reach, engagement, or revenue from posted content</li>
            <li>API downtime or service interruptions</li>
            <li>Data loss in the event of system failure</li>
          </ul>
          <p>
            Users are responsible for understanding TikTok's policies and approving content accordingly.
          </p>
        </section>

        <section>
          <h2>7. Termination</h2>
          <p>
            Your access to Runnit Back HQ may be terminated if:
          </p>
          <ul>
            <li>You approve content that violates TikTok's Community Guidelines repeatedly</li>
            <li>Your TikTok account is suspended or banned</li>
            <li>You disconnect your TikTok OAuth authorization</li>
            <li>You request account deletion</li>
          </ul>
        </section>

        <section>
          <h2>8. Changes to Terms</h2>
          <p>
            We may update these terms at any time. Continued use of the service constitutes acceptance of updated terms.
          </p>
        </section>

        <section>
          <h2>9. Contact</h2>
          <p>
            For questions about these terms, contact: <strong>support@runnit.local</strong>
          </p>
        </section>

        <section className={styles.footer}>
          <Link href="/privacy">Privacy Policy</Link>
          <span>•</span>
          <Link href="/">Back to App</Link>
        </section>
      </main>
    </div>
  );
}
