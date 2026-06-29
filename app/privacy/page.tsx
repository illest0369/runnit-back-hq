export default function PrivacyPage() {
  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        color: "#ffffff",
        minHeight: "100vh",
        padding: "64px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: "1.7",
      }}
    >
      <div style={{ maxWidth: "672px", margin: "0 auto" }}>
        <a
          href="/"
          style={{
            color: "#a0a0a0",
            textDecoration: "none",
            fontSize: "14px",
            display: "inline-block",
            marginBottom: "40px",
          }}
        >
          &larr; Back to Runnit Back
        </a>

        <h1
          style={{
            fontSize: "36px",
            fontWeight: "700",
            marginBottom: "8px",
            color: "#ffffff",
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: "#a0a0a0", fontSize: "14px", marginBottom: "48px" }}>
          Last updated: March 30, 2026
        </p>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            1. Overview
          </h2>
          <p style={{ color: "#c0c0c0" }}>
            Runnit Back LLC (&ldquo;Runnit Back&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the
            Runnit Back application at{" "}
            <a
              href="https://frontend-woad-gamma-18.vercel.app"
              style={{ color: "#60a5fa" }}
            >
              https://frontend-woad-gamma-18.vercel.app
            </a>
            . This Privacy Policy explains how we collect, use, and protect your
            information when you use our service.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            2. Information We Collect
          </h2>
          <p style={{ color: "#c0c0c0", marginBottom: "12px" }}>
            When you connect your TikTok account to Runnit Back, we collect and
            store the following information provided by the TikTok API:
          </p>
          <ul
            style={{
              color: "#c0c0c0",
              paddingLeft: "24px",
              marginBottom: "12px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#ffffff" }}>Display name</strong> &mdash;
              your TikTok username or display name, used to identify your
              connected account within the app.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#ffffff" }}>Open ID</strong> &mdash; a
              unique, TikTok-assigned identifier for your account used to
              associate your account with our service.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#ffffff" }}>
                Access tokens and refresh tokens
              </strong>{" "}
              &mdash; OAuth credentials issued by TikTok that allow us to act on
              your behalf when posting content. These are stored server-side in
              our encrypted database and are never exposed to the browser.
            </li>
          </ul>
          <p style={{ color: "#c0c0c0" }}>
            We do not collect passwords, payment information, or any other
            personal data beyond what is listed above.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            3. TikTok API Scopes
          </h2>
          <p style={{ color: "#c0c0c0", marginBottom: "12px" }}>
            Runnit Back requests the following TikTok API permission scopes to
            operate:
          </p>
          <ul
            style={{
              color: "#c0c0c0",
              paddingLeft: "24px",
              marginBottom: "12px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <code
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                user.info.basic
              </code>{" "}
              &mdash; to retrieve your display name and open ID.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <code
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                video.upload
              </code>{" "}
              &mdash; to upload video files to TikTok on your behalf.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <code
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                video.publish
              </code>{" "}
              &mdash; to publish scheduled or queued video posts to your TikTok
              account.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <code
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                video.list
              </code>{" "}
              &mdash; to retrieve a list of your previously published videos for
              display within the app.
            </li>
          </ul>
          <p style={{ color: "#c0c0c0" }}>
            We only request the minimum permissions necessary to provide the
            service. We do not access any other data from your TikTok account.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            4. How We Use Your Information
          </h2>
          <p style={{ color: "#c0c0c0", marginBottom: "12px" }}>
            The information we collect is used exclusively to:
          </p>
          <ul style={{ color: "#c0c0c0", paddingLeft: "24px" }}>
            <li style={{ marginBottom: "8px" }}>
              Authenticate and maintain a connection to your TikTok account.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Post video content to your connected TikTok account on your
              explicit instruction.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Display your account identity (display name) within the Runnit
              Back interface so you can confirm which account is connected.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Retrieve your published video list for display within the app.
            </li>
          </ul>
          <p style={{ color: "#c0c0c0", marginTop: "12px" }}>
            We do not use your data for advertising, analytics sold to third
            parties, or any purpose beyond operating the core posting
            functionality described above.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            5. Data Storage and Security
          </h2>
          <p style={{ color: "#c0c0c0" }}>
            Your TikTok access tokens and refresh tokens are stored encrypted in
            our database. They are only transmitted over HTTPS and are only used
            server-side to make authorized requests to the TikTok API on your
            behalf. We do not log or expose tokens in client-side code, error
            messages, or third-party analytics tools.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            6. Data Sharing
          </h2>
          <p style={{ color: "#c0c0c0" }}>
            We do not sell, rent, trade, or otherwise share your personal
            information or TikTok account data with any third parties. Your data
            is used solely within Runnit Back to provide the service you have
            requested.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            7. Your Rights and Data Deletion
          </h2>
          <p style={{ color: "#c0c0c0", marginBottom: "12px" }}>
            You have the right to:
          </p>
          <ul style={{ color: "#c0c0c0", paddingLeft: "24px" }}>
            <li style={{ marginBottom: "8px" }}>
              Disconnect your TikTok account from Runnit Back at any time by
              contacting us at{" "}
              <a
                href="mailto:legal@runnitback.com"
                style={{ color: "#60a5fa" }}
              >
                legal@runnitback.com
              </a>
              . Upon disconnection, your stored tokens and account identifiers
              will be deleted.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Request deletion of all data we hold about you by emailing us at
              the address above.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Request a copy of the data we hold about you.
            </li>
          </ul>
          <p style={{ color: "#c0c0c0", marginTop: "12px" }}>
            You may also revoke Runnit Back&rsquo;s access to your TikTok account
            directly through TikTok&rsquo;s app settings under &ldquo;Manage app
            permissions&rdquo;.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            8. Changes to This Policy
          </h2>
          <p style={{ color: "#c0c0c0" }}>
            We may update this Privacy Policy from time to time. Changes will be
            posted at this URL with an updated &ldquo;Last updated&rdquo; date. Continued
            use of the service after changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#ffffff",
            }}
          >
            9. Contact
          </h2>
          <p style={{ color: "#c0c0c0" }}>
            If you have any questions about this Privacy Policy or how we handle
            your data, please contact us at:
          </p>
          <p style={{ color: "#c0c0c0", marginTop: "12px" }}>
            <strong style={{ color: "#ffffff" }}>Runnit Back LLC</strong>
            <br />
            Email:{" "}
            <a href="mailto:legal@runnitback.com" style={{ color: "#60a5fa" }}>
              legal@runnitback.com
            </a>
            <br />
            Website:{" "}
            <a
              href="https://frontend-woad-gamma-18.vercel.app"
              style={{ color: "#60a5fa" }}
            >
              https://frontend-woad-gamma-18.vercel.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
