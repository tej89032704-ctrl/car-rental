import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared Terms & Conditions page. Rendered at /terms in all four portals.
 * Product-accurate: booking flow (request -> approve -> 20% advance + deposit
 * hold -> balance at pickup), Spec 6.3 cancellation tiers, 6.5 deposit,
 * 6.6 late return, 6.4 subscriptions, KYC (Aadhaar masked, DL), disputes.
 *
 * Replace the [Operator ...] placeholders with the real legal identity before
 * going live.
 */
export default function Terms({ backTo, brand = 'CAR-ENT' }) {
  return (
    <div className="tc-shell" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <style>{`/* scoped Terms styles */
        .tc-shell { font-family: var(--font); }
        /* A bare alpha-white here would stay white under the dark ladder, so the
           sticky bar takes the shared glass fill and blur instead. */
        .tc-top { position: sticky; top: 0; z-index: 5; background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-bottom: 1px solid var(--line-soft); }
        .tc-top-in { max-width: 780px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
        .tc-brand { font-weight: 800; letter-spacing: -.02em; font-size: 16px; }
        .tc-brand b { color: var(--acc-text); }
        .tc-back { color: var(--muted); font-size: 13px; text-decoration: none; font-weight: 600; }
        .tc-back:hover { color: var(--ink); }
        .tc-body { max-width: 780px; margin: 0 auto; padding: 44px 20px 72px; }
        .tc-kicker { color: var(--muted); font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
        .tc-h1 { font-family: var(--font-display); font-size: 40px; line-height: 1.08; letter-spacing: -.03em; margin: 10px 0 10px; }
        .tc-updated { color: var(--muted); font-size: 14px; margin-bottom: 26px; }
        .tc-lead { font-size: 17px; line-height: 1.6; color: var(--ink); border-left: 3px solid var(--acc); padding-left: 16px; margin: 0 0 36px; }
        .tc-section { margin: 0 0 30px; }
        .tc-h2 { font-size: 20px; font-weight: 800; letter-spacing: -.01em; margin: 0 0 10px; }
        .tc-h3 { font-size: 15px; font-weight: 700; margin: 18px 0 6px; }
        .tc-p { font-size: 14.5px; line-height: 1.65; color: var(--ink-2); margin: 0 0 10px; }
        .tc-p b { color: var(--ink); }
        .tc-p .ph { color: var(--muted); font-style: italic; }
        .tc-ul { margin: 4px 0 12px; padding-left: 20px; }
        .tc-ul li { font-size: 14.5px; line-height: 1.6; color: var(--ink-2); margin-bottom: 6px; }
        .tc-table { width: 100%; border-collapse: collapse; margin: 14px 0 18px; font-size: 13.5px; }
        .tc-table th { text-align: left; font-family: var(--font-mono); font-weight: 700; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); }
        .tc-table td { padding: 10px; border-bottom: 1px solid var(--line-soft); vertical-align: top; line-height: 1.5; }
        .tc-note { background: var(--bg-soft); border: 1px solid var(--line-soft); border-radius: 12px; padding: 14px 16px; font-size: 13.5px; line-height: 1.55; color: var(--ink-2); margin: 16px 0; }
        .tc-tag { display: inline-block; background: var(--acc-soft); color: var(--acc-text); border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
      `}</style>

      <header className="tc-top">
        <div className="tc-top-in">
          <div className="tc-brand"><b>{brand}</b> <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· Legal</span></div>
          {backTo ? (
            <Link to={backTo} className="tc-back">‹ Back</Link>
          ) : (
            <span className="tc-brand" style={{ color: 'var(--muted)', fontWeight: 600 }}>Terms &amp; Conditions</span>
          )}
        </div>
      </header>

      <div className="tc-body">
        <p className="tc-kicker">Legal</p>
        <h1 className="tc-h1">Terms &amp; Conditions</h1>
        <p className="tc-updated">Last updated: <span className="ph">[Effective date]</span> · Applies across all CAR-ENT portals (renter, owner, agent, admin).</p>

        <p className="tc-lead">
          Welcome to <b>{brand}</b>, a verified marketplace for self-drive car rentals connecting car
          owners with validated renters. These Terms govern your use of the Platform. By creating an account,
          browsing listings, or completing a booking, you agree to be bound by them.
        </p>

        <section className="tc-section">
          <h2 className="tc-h2">1. The Service</h2>
          <p className="tc-p">
            {brand} is a technology platform, not a car rental company. We connect <b>owners</b> who list their
            vehicles with <b>renters</b> who book them, and we operate the verification, booking, payment-ledger,
            and dispute-resolution processes in between. We do not own, hold, or insure the vehicles listed on the
            Platform, and every car remains the property and responsibility of the listing owner.
          </p>
          <p className="tc-p">
            The Platform includes the renter portal, owner portal, agent portal, and admin portal. Some facilities —
            such as agent verification workflows and administrative review — are only available to authorised
            personnel under a separate agreement.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">2. Accounts &amp; Eligibility</h2>
          <ul className="tc-ul">
            <li>You must be <b>at least 18 years old</b> and legally capable of entering into a binding agreement.</li>
            <li>You must provide <b>accurate, current account details</b> (name, email, phone). You are responsible for keeping your login credentials confidential and for all activity under your account.</li>
            <li>To rent a car you must hold a <b>valid driving licence</b> (as recognised by Indian law) and carry the <b>original licence</b> at the time of pickup. The owner may verify it before handing over the keys.</li>
            <li>Each account is for a single person. Businesses listing fleet vehicles must identify the responsible individual and are subject to the same verification.</li>
            <li>We may suspend or close accounts that are inaccurate, share credentials, or are used for fraud, at our discretion and in line with Section 15.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">3. Verification &amp; KYC</h2>
          <p className="tc-p">
            To protect owners and renters alike, every renter completes a <b>Know-Your-Customer (KYC)</b> check before
            their first booking is confirmed:
          </p>
          <ul className="tc-ul">
            <li>You will be asked to upload a <b>government-issued identity document</b> (Aadhaar) and your <b>driving licence</b>.</li>
            <li>Documents are reviewed <b>by trained personnel</b> before approval. A booking may only proceed once your KYC status is <b>approved</b>.</li>
            <li>We <b>never store your full Aadhaar number</b>. Identity data is stored in masked form (for example <span className="ph">XXXX XXXX 1234</span>) and is only accessible to verification and support staff on a need-to-know basis.</li>
            <li>We may request additional documents or reject an application if the documents are illegible, expired, or appear fraudulent.</li>
          </ul>
          <p className="tc-note">
            Providing a forged document or identity is a material breach of these Terms and may result in permanent
            suspension and referral to the relevant authorities.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">4. Listing a Car (Owners)</h2>
          <ul className="tc-ul">
            <li>Owners are responsible for the <b>accuracy of every listing</b> — make, model, year, condition, photos, and daily/weekly/monthly price.</li>
            <li>Before a listing goes live it must pass <b>approval</b>, including valid registration certificate (RC), insurance, and photographs. We may reject or remove listings at any time.</li>
            <li>Listed vehicles must be <b>road-worthy, insured, and compliant</b> with all applicable laws, and must match the listing at pickup.</li>
            <li>An owner who confirms a booking is committed to it: the vehicle must be available at the confirmed dates and location, or the owner is liable as set out in Section 10.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">5. Booking Process</h2>
          <p className="tc-p">Every booking follows the same flow:</p>
          <ul className="tc-ul">
            <li><b>1 · Request.</b> The renter selects dates and sends a booking request; the car is immediately marked unavailable.</li>
            <li><b>2 · Owner approval.</b> The owner accepts or rejects the request. The booking is only confirmed on approval.</li>
            <li><b>3 · Partial payment &amp; deposit.</b> The renter pays a <b>partial advance online</b> (currently <b>20%</b> of the booking value, as shown at checkout) and a <b>security deposit</b> is held on the Platform ledger.</li>
            <li><b>4 · Balance at pickup.</b> The remaining balance is payable at the time of pickup in cash or UPI (recorded by the owner on the Platform).</li>
            <li><b>5 · Trip &amp; completion.</b> At pickup the trip starts; at return it is completed and the settlement and deposit-release process begins.</li>
          </ul>
          <p className="tc-p">
            The advance percentage, deposit amounts, and prices are displayed before you pay. A receipt or invoice is
            generated for every online payment and available in your booking history.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">6. Payments &amp; Fees</h2>
          <ul className="tc-ul">
            <li>All amounts are payable in <b>Indian Rupees (₹)</b>. Prices shown are per day unless stated otherwise.</li>
            <li>Online payments are recorded on the Platform ledger and matched to your booking. The renter’s <b>advance is held</b> until the trip completes, then settled to the owner’s earnings wallet.</li>
            <li>The <b>security deposit is a hold, not a charge</b>: it is released as described in Section 7 once the trip is completed and any dispute is resolved.</li>
            <li>Platform membership is optional and subscription-based: owners may subscribe for <span className="ph">[Owner subscription, e.g. ₹100/month]</span>, and renters may purchase a <b>lifetime membership</b> where offered. Membership status is shown before purchase and is non-transferable.</li>
            <li>You are responsible for any taxes levied in connection with the services, to the extent applicable by law.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">7. Cancellation, Refunds &amp; Deposit</h2>
          <p className="tc-p">Cancellation refunds are tiered based on when you cancel relative to the trip start:</p>
          <table className="tc-table">
            <thead>
              <tr><th>When you cancel</th><th>Tier</th><th>What happens</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Before the owner approves (request still pending)</td>
                <td><span className="tc-tag">Free</span></td>
                <td>No charge. Nothing has been paid, so nothing is retained.</td>
              </tr>
              <tr>
                <td>At least 24 hours before the trip start</td>
                <td><span className="tc-tag">Free</span></td>
                <td>Your partial advance is refunded in full.</td>
              </tr>
              <tr>
                <td>Less than 24 hours before the trip start</td>
                <td><span className="tc-tag">50% — partial refund</span></td>
                <td>50% of the booking value is retained as a cancellation fee (applied against the amounts you have paid); the remainder, if any, is refunded.</td>
              </tr>
              <tr>
                <td>After the trip has started</td>
                <td><span className="tc-tag">No refund</span></td>
                <td>The full amount you have paid for the trip is retained.</td>
              </tr>
            </tbody>
          </table>
          <ul className="tc-ul">
            <li>Refunds are only ever made <b>up to the amounts you have actually paid</b> — never more.</li>
            <li>When a booking is cancelled, the <b>security deposit is released</b> in full along with any refund due.</li>
            <li>Refunds are credited to your account on the Platform’s ledger. Depending on how you paid, the funds may take a few business days to reflect in your bank account.</li>
            <li>If the <b>owner cancels or fails to honour a confirmed booking</b>, you are entitled to a full refund of everything you paid; we may also apply remedies under Section 10.</li>
          </ul>

          <h3 className="tc-h3">Security deposit</h3>
          <p className="tc-p">
            The deposit protects against damage, late return, and unpaid fines. It is <b>held</b> for the duration of the
            trip and is normally <b>auto-released within 24 hours</b> after the trip is completed, provided there is no
            open dispute or unresolved charge. A deposit stays held while a dispute is being reviewed.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">8. Trip Rules &amp; Late Return</h2>
          <ul className="tc-ul">
            <li>The renter must present their <b>original driving licence</b> at pickup and must be the <b>only driver</b> unless an additional verified driver is noted on the booking.</li>
            <li>Do not <b>sub-let, share, race, or use</b> the vehicle for hire, illegal activity, or any purpose outside the rental agreement.</li>
            <li>Follow all traffic laws. <b>Traffic fines, tolls, parking charges, refuelling, and any applicable State permit charges</b> are the renter’s responsibility.</li>
            <li>Return the car <b>on time and in the condition it was received</b> (subject to normal wear and tear). A <b>late return costs 10% of the daily rate per hour, capped at one full day’s rate</b>.</li>
            <li>Smoking, pets, and off-road use are not permitted unless the owner has agreed otherwise.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">9. Earnings &amp; Payouts (Owners)</h2>
          <ul className="tc-ul">
            <li>Your earnings wallet accumulates the settled share of completed trips. Earnings become <b>available only after the trip is completed and the dispute window has closed</b> (no open dispute).</li>
            <li>You may request a <b>payout</b> from your available balance; payouts are processed and marked accordingly by the Platform.</li>
            <li>Amounts are tracked to the paisa on the ledger, and every money movement is audited.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">10. Disputes &amp; Settlement</h2>
          <p className="tc-p">
            Reasonable disagreements (condition at return, fines, damage, deposit disputes) go through the Platform’s
            dispute process: either party files a dispute, the deposit and any disputed funds remain held, and a
            resolution is recorded. While a dispute is open, auto-refunds and owner settlement are paused for that booking.
          </p>
          <p className="tc-p">
            The Platform may, in its discretion, decide on any dispute based on the evidence on file (photos, check-in/out
            records, third-party reports). Our decision is final unless a court of competent jurisdiction orders otherwise.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">11. Prohibited Conduct</h2>
          <ul className="tc-ul">
            <li>Creating fraudulent accounts, submitting forged documents, or impersonating another person.</li>
            <li>Manipulating prices, reviews, ratings, or availability; off-platform fee evasion of any kind.</li>
            <li>Attempting to access another user’s account, or compromising the security of the Platform.</li>
            <li>Scraping, crawling, or copying listings or user data without permission.</li>
            <li>Posting unlawful, defamatory, or infringing content.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">12. Intellectual Property</h2>
          <p className="tc-p">
            The Platform, its design, software, and content (excluding the cars and photos owners submit) are owned by
            the Operator or its licensors and are protected by applicable law. We grant you a limited, revocable,
            non-exclusive licence to use the Platform for its intended purpose. You may not reproduce or redistribute
            Platform content without our prior written consent.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">13. Privacy &amp; Data</h2>
          <ul className="tc-ul">
            <li>We collect the information needed to run the Platform: account details, verification documents (stored masked as described in Section 3), bookings, and payment-ledger records.</li>
            <li>We use your data to deliver the service, verify identity, prevent fraud, and communicate with you (including via the in-app notification centre, SMS, and email).</li>
            <li>We do <b>not</b> sell your personal data. It is shared only with verification staff, and with owners/renters as reasonably necessary to complete a booking, and with authorities where the law requires it.</li>
            <li>A separate Privacy Policy will be made available and will be deemed part of these Terms.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">14. Disclaimers &amp; Limitation of Liability</h2>
          <ul className="tc-ul">
            <li>The Platform is provided <b>“as is”</b> and <b>“as available”</b>. We do not guarantee uninterrupted availability, error-free operation, or that every listed car is as described — the condition of each vehicle is the owner’s responsibility.</li>
            <li>We act as an <b>intermediary only</b>. To the maximum extent permitted by law, the Operator shall not be liable for damages arising between owners and renters beyond the amounts actually transacted through the Platform (for example, your partial advance and deposit), or for indirect, consequential, or punitive losses.</li>
            <li>Nothing in these Terms limits liability that cannot be limited by applicable law.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">15. Suspension &amp; Termination</h2>
          <p className="tc-p">
            You may close your account at any time; however, obligations already incurred (active bookings, deposits,
            or disputes at the time of closure) remain governed by these Terms. We may suspend or terminate access for
            breach of these Terms, suspected fraud, or risk to the Platform or other users. On termination, confirmed
            bookings are cancelled and refunds are processed per Section 7.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">16. Changes to These Terms</h2>
          <p className="tc-p">
            We may update these Terms from time to time as the service evolves. Updated Terms are published on the
            Platform and notified through your notification centre, and the “Last updated” date above is revised.
            Continued use of the Platform after an update constitutes acceptance.
          </p>
        </section>

        <section className="tc-section">
          <h2 className="tc-h2">17. Governing Law &amp; Jurisdiction</h2>
          <p className="tc-p">
            These Terms are governed by the <b>laws of the Republic of India</b>. Any disputes not resolved through
            the Platform’s process in Section 10 shall be subject to the exclusive jurisdiction of the courts at
            <span className="ph"> [Place of jurisdiction]</span>.
          </p>
        </section>

        <section className="tc-section" style={{ marginBottom: 0 }}>
          <h2 className="tc-h2">18. Contact</h2>
          <p className="tc-p">
            Questions about these Terms or your account can be sent to <span className="ph">[Support email]</span>,
            or posted to <span className="ph">[Operator legal name], [Registered address]</span>.
          </p>
          <p className="tc-note">
            Operator: <span className="ph">[Operator legal name]</span>. These Terms replace all prior versions.
            If any provision is held unenforceable, the remainder stays in force.
          </p>
        </section>
      </div>
    </div>
  );
}