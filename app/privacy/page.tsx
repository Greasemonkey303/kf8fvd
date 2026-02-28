import React from 'react';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for KF8FVD — how data is handled and stored.'
};

export default function PrivacyPage() {
  return (
    <main className="page-pad">
      <div className="center-900">
      <h1>Privacy Policy</h1>
      <p>Last updated: {new Date().toLocaleDateString()}</p>

      <h2>Summary</h2>
      <p>
        KF8FVD values your privacy. This site collects only the information you
        voluntarily provide through the contact form and any files you attach to
        messages. Attachments are transmitted by email to the site owner and are
        not publicly posted.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and email when you submit the contact form.</li>
        <li>Message contents you provide in the contact form.</li>
        <li>Files you attach to messages (these are sent by email to the site owner).</li>
        <li>Basic request metadata: IP address, user agent, and timestamp (logged to help manage spam and site maintenance).</li>
      </ul>

      <h2>How we use the data</h2>
      <p>
        Messages and attachments submitted via the contact form are emailed to
        the site owner using SendGrid and appended to a local log file for
        administration. We use this data only to respond to inquiries and for
        site maintenance.
      </p>

      <h2>Storage and retention</h2>
      <p>
        Messages are appended to <code>./data/messages.log</code> on the server
        for operational purposes. Attachments are included in the email sent to
        the site owner and are not stored long-term by the site itself. If you
        would like your message or attachments deleted, please contact the site
        owner requesting removal.
      </p>

      <h2>Third-party services</h2>
      <p>
        The site uses Cloudflare Turnstile to help prevent spam and SendGrid to
        send emails. These services have their own privacy practices and you
        should review their privacy policies as needed.
      </p>

      <h2>Local caching</h2>
      <p>
        For performance, some site features use your browser's localStorage to
        cache data (for example, certain dashboard widgets). This cached data
        stays on your device and is not shared with third parties.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy or want to request deletion of
        your data, email the site owner via the contact form on this site.
      </p>
      </div>
    </main>
  );
}
