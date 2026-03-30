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
        messages, plus limited operational and analytics data needed to keep the
        public website working. Attachments are transmitted by email to the site
        owner, may be retained in private object storage for admin follow-up, and
        are not publicly posted.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and email when you submit the contact form.</li>
        <li>Message contents you provide in the contact form.</li>
        <li>Files you attach to messages (these are sent by email to the site owner).</li>
        <li>Basic request metadata: IP address, user agent, and timestamp (logged to help manage spam and site maintenance).</li>
        <li>Privacy-focused visitor analytics for public pages only, such as page paths, referrers, approximate country, screen size, device type, and browser details.</li>
      </ul>

      <h2>How we use the data</h2>
      <p>
        Messages and attachments submitted via the contact form are emailed to
        the site owner using SendGrid and the message record is appended to a
        local log file for administration. Attachments retained for admin
        follow-up are stored in the site&apos;s private object storage and are not
        publicly posted. We use this data only to respond to inquiries, maintain
        the site, and review aggregate public-site usage.
      </p>

      <h2>Storage and retention</h2>
      <p>
        Messages are appended to <code>./data/messages.log</code> on the server
        for operational purposes. Attachments are included in the email sent to
        the site owner and may also be retained in private object storage for
        administrative follow-up and backup/restore integrity. If you would like
        your message or attachments deleted, please contact the site owner
        requesting removal.
      </p>
      <p>
        Public-site analytics events are stored in a self-hosted Umami service
        with a dedicated PostgreSQL database controlled by the site owner rather
        than being sent to Google Analytics or another third-party ad network.
      </p>

      <h2>Third-party services</h2>
      <p>
        The site uses Cloudflare Turnstile to help prevent spam and SendGrid to
        send emails. These services have their own privacy practices and you
        should review their privacy policies as needed.
      </p>

      <h2>Visitor analytics</h2>
      <p>
        Public pages may use a self-hosted Umami analytics service to measure
        aggregate visitor traffic. This analytics setup is intended for site
        performance and content planning, respects browser Do Not Track, and is
        configured to avoid tracking admin, API, and account-management routes.
      </p>
      <p>
        Analytics events are limited to site usage information such as page
        paths, referrers, approximate location, screen size, device/browser
        details, and similar request metadata. Contact-form contents, uploaded
        files, passwords, and private admin actions are not sent to the analytics
        service. For reliability, the public site relays analytics events through
        its own same-origin endpoint before forwarding them to the self-hosted
        analytics service.
      </p>

      <h2>Operational monitoring</h2>
      <p>
        The site also records service-health and abuse-prevention metrics for
        administration, such as dependency status, route error counts, rate-limit
        behavior, and storage growth. These operational metrics are used to keep
        the site available and secure and are not used for advertising.
      </p>

      <h2>Local caching</h2>
      <p>
        For performance, some site features use your browser&apos;s localStorage to
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
