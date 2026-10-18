/** Data Privacy notice (RA 10173). Shared by the consent gate and the public /privacy page. */
export function PrivacyNotice() {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-muted [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg">
      <p>
        Trinity University of Asia (TUA) respects your privacy. This notice explains how the Office of the University
        Registrar handles your personal information in the Student Request Portal, in line with the{' '}
        <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>.
      </p>
      <section>
        <h2>What we collect</h2>
        <ul className="space-y-1">
          <li>Your name, student number, program, year level and enrollment status (from Registrar records).</li>
          <li>Your contact number and mailing address, if you provide them.</li>
          <li>Details you enter in each request, and the files you upload (such as a valid ID or clearance).</li>
          <li>Payment references and receipts, when a fee applies.</li>
        </ul>
      </section>
      <section>
        <h2>Why we collect it</h2>
        <p>Only to verify your identity, process and release the documents you request, and contact you about them.</p>
      </section>
      <section>
        <h2>Who can see it</h2>
        <p>
          Only authorized Registrar personnel, and only what they need for your request. Every time staff view your
          request or download your files, it is recorded in an audit log. We do not sell or share your data with third
          parties, except a courier you choose for delivery, or when required by law.
        </p>
      </section>
      <section>
        <h2>How we protect and keep it</h2>
        <p>
          Uploaded files are encrypted in storage and are never publicly accessible. Request records are kept for as
          long as the University’s records retention policy requires, then securely disposed of.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You may access and correct your information, object to its processing, ask for its deletion where allowed by
          law, and file a complaint with the National Privacy Commission. Contact the University Data Protection
          Officer at <strong>dpo@tua.edu.ph</strong>.
        </p>
      </section>
    </div>
  )
}
