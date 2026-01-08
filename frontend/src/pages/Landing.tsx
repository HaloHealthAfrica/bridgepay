import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Wallet,
  QrCode,
  CreditCard,
  Phone,
  Building2,
  ReceiptText,
  Shuffle,
  Lock,
  ClipboardCheck,
  Users,
  Store,
  BriefcaseBusiness,
  BadgeCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../components/ui/Buttons";

function SectionTitle({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {kicker ? <div className="text-xs font-semibold tracking-wide uppercase text-primary mb-2">{kicker}</div> : null}
      <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-2">{title}</h2>
      {subtitle ? <p className="text-text-secondary max-w-2xl">{subtitle}</p> : null}
    </div>
  );
}

function Card({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-surface border border-gray-200 rounded-card p-5">
      <div className="w-10 h-10 rounded-button bg-primary-light flex items-center justify-center text-primary mb-3">
        {icon}
      </div>
      <div className="font-bold text-text mb-1">{title}</div>
      <div className="text-sm text-text-secondary">{body}</div>
    </div>
  );
}

function AudienceCard({
  icon,
  title,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  bullets: string[];
}) {
  return (
    <div className="bg-surface border border-gray-200 rounded-card p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-button bg-primary-light flex items-center justify-center text-primary">
          {icon}
        </div>
        <div className="font-bold text-text">{title}</div>
      </div>
      <ul className="space-y-2 text-sm text-text-secondary">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5" size={16} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="bg-surface border border-gray-200 rounded-card p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-button bg-primary text-white flex items-center justify-center font-extrabold">
          {n}
        </div>
        <div className="font-bold text-text">{title}</div>
      </div>
      <div className="text-sm text-text-secondary">{body}</div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="bg-surface border border-gray-200 rounded-card p-6 md:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-light text-primary text-sm font-semibold mb-4">
              <ShieldCheck size={16} /> Built for trust in Africa
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold text-text leading-tight mb-4">
              Secure wallets, payments, and project funding you can actually verify.
            </h1>
            <p className="text-text-secondary text-base md:text-lg max-w-xl mb-6">
              Bridge helps individuals, merchants, and communities move money with clarity — from wallet deposits to escrow
              releases — with a record you can trust.
            </p>
            <div className="bg-primary-light border border-primary/20 rounded-button p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-button bg-surface flex items-center justify-center text-primary">
                  <Shuffle size={18} />
                </div>
                <div>
                  <div className="font-semibold text-text">Interoperable by design</div>
                  <div className="text-sm text-text-secondary">
                    Pay and fund projects from multiple sources — wallet, M‑Pesa, Paybill, card, and bank — all tracked in one place.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <PrimaryButton onClick={() => navigate("/register")} icon={ArrowRight}>
                Get Started
              </PrimaryButton>
              <SecondaryButton onClick={() => navigate("/login")}>Sign In</SecondaryButton>
            </div>

            <div className="mt-6 text-sm text-text-secondary">
              Low-bandwidth friendly. Built around local realities: mobile money, cards, and QR.
            </div>
          </div>

          <div className="bg-background rounded-card p-6 border border-gray-200">
            <div className="font-bold text-text mb-3">What you get with Bridge</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Traceable funds</div>
                <div className="text-xs text-text-secondary">Every payment and release has a reference.</div>
              </div>
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Escrow protection</div>
                <div className="text-xs text-text-secondary">Hold funds until milestones are verified.</div>
              </div>
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Local payments</div>
                <div className="text-xs text-text-secondary">STK Push, Paybill, card checkout, and QR pay.</div>
              </div>
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Accountability</div>
                <div className="text-xs text-text-secondary">Less “trust me.” More proof.</div>
              </div>
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Withdraw to bank</div>
                <div className="text-xs text-text-secondary">A2P bank transfers from your wallet.</div>
              </div>
              <div className="bg-surface border border-gray-200 rounded-button p-4">
                <div className="text-sm font-semibold text-text mb-1">Diaspora rails</div>
                <div className="text-xs text-text-secondary">Card and diaspora funding options to wallet or projects.</div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-text-secondary">
              <div className="flex items-center gap-2">
                <Lock size={14} /> Calm, secure-by-default experience
              </div>
              <Link to="/register" className="text-primary font-semibold hover:underline">
                Create a free account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What is Bridge */}
      <section id="what">
        <SectionTitle
          kicker="What is Bridge?"
          title="A simple platform for holding money, paying, and funding projects transparently."
          subtitle="Bridge is designed for Africans who want control and clarity — whether it’s daily payments, business revenue, or money raised for a project."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            icon={<Wallet size={20} />}
            title="Digital Wallets"
            body="Hold funds safely, view balances, and track every movement."
          />
          <Card
            icon={<Phone size={20} />}
            title="Payments that work locally"
            body="Use mobile money (STK Push), Paybill, cards, and QR payments — built for African usage."
          />
          <Card
            icon={<ReceiptText size={20} />}
            title="Paybill Deposits"
            body="Top up using a Paybill number and your unique account reference."
          />
          <Card
            icon={<Building2 size={20} />}
            title="Bank Transfer (A2P)"
            body="Withdraw from your wallet to a bank account when you need it."
          />
          <Card
            icon={<Shuffle size={20} />}
            title="Interoperable payments"
            body="One wallet view across sources — use what you have, keep one clear record."
          />
          <Card
            icon={<ClipboardCheck size={20} />}
            title="Escrow & Project Funding"
            body="Lock funds for a project and release them only when milestones are approved."
          />
          <Card
            icon={<BadgeCheck size={20} />}
            title="Verification & Accountability"
            body="Identity, milestones, and transactions are logged — fewer scams, more proof."
          />
        </div>
      </section>

      {/* Who it's for */}
      <section id="for">
        <SectionTitle
          kicker="Who Bridge is for"
          title="Built for real people, real businesses, and real projects."
          subtitle="Bridge supports different roles — everyone sees what they need, and everything stays traceable."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AudienceCard
            icon={<Users size={20} />}
            title="Consumers"
            bullets={["Send and receive money", "See transaction history clearly", "Avoid WhatsApp-only “trust me” deals"]}
          />
          <AudienceCard
            icon={<Store size={20} />}
            title="Merchants"
            bullets={["Accept wallet/QR payments", "Track revenue and payments", "Share payment links with customers"]}
          />
          <AudienceCard
            icon={<BriefcaseBusiness size={20} />}
            title="Project Owners"
            bullets={["Raise funds with transparency", "Manage milestones and escrow", "Give backers confidence"]}
          />
          <AudienceCard
            icon={<BadgeCheck size={20} />}
            title="Verifiers & Communities"
            bullets={["Verify identity and milestones", "Confirm delivery before releases", "Keep records for group accountability"]}
          />
        </div>
      </section>

      {/* Why Bridge */}
      <section id="trust" className="bg-surface border border-gray-200 rounded-card p-6 md:p-10">
        <SectionTitle
          kicker="Why Bridge"
          title="Trust, without the drama."
          subtitle="Many people across Africa have been burned by scams and unclear money handling. Bridge is designed to be calm, traceable, and accountable."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card icon={<ShieldCheck size={20} />} title="Funds are traceable" body="Every deposit, payment, and release is logged with references." />
          <Card icon={<ClipboardCheck size={20} />} title="Projects can be verified" body="Milestone approvals provide proof before funds move." />
          <Card icon={<QrCode size={20} />} title="Payments are logged" body="QR and wallet payments leave a clear record for both sides." />
          <Card icon={<CreditCard size={20} />} title="Built for African realities" body="Mobile money workflows, Paybill, cards, and low-bandwidth friendliness." />
        </div>

        <div className="mt-6 text-sm text-text-secondary">
          No WhatsApp-only “trust me” deals. No confusing spreadsheets. Just a clearer way to handle money.
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <SectionTitle kicker="How it works" title="Simple steps. Clear records." subtitle="Start small, then grow into payments, escrow, and funded projects." />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <Step n={1} title="Create an account" body="Sign up in minutes and get your Bridge profile." />
          </div>
          <div className="md:col-span-3">
            <Step n={2} title="Get a wallet" body="Your wallet shows balance, pending, and escrow funds — clearly separated." />
          </div>
          <div className="md:col-span-3">
            <Step n={3} title="Add money or receive funds" body="Use mobile money, card, or receive payments from others." />
          </div>
          <div className="md:col-span-2">
            <Step n={4} title="Pay or fund projects" body="Pay merchants, fund projects, or lock funds in escrow." />
          </div>
          <div className="md:col-span-5">
            <Step n={5} title="Track everything" body="History, references, and verification give you accountability at every step." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white rounded-card p-6 md:p-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="text-2xl md:text-3xl font-extrabold mb-2">Ready to use Bridge?</div>
            <div className="text-white/90">
              Create a free account and start with a secure wallet — then explore payments, escrow, and transparent project funding.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="bg-white text-primary rounded-button px-6 py-4 text-base font-semibold shadow-button hover:bg-primary-light"
            >
              Create a Free Account
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="bg-primary-dark text-white rounded-button px-6 py-4 text-base font-semibold border border-white/20 hover:bg-primary-dark/90"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-8">
        <div className="border-t border-gray-200 pt-6 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
          <div>
            <div className="font-extrabold text-text">Bridge</div>
            <div className="text-sm text-text-secondary">Payments, escrow, and project funding — built for Africa.</div>
            <div className="text-xs text-text-secondary mt-2">© {new Date().getFullYear()} Bridge • Built for Africa</div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/login" className="text-text-secondary hover:text-primary">
              Login
            </Link>
            <Link to="/register" className="text-text-secondary hover:text-primary">
              Register
            </Link>
            <Link to="/privacy" className="text-text-secondary hover:text-primary">
              Privacy
            </Link>
            <Link to="/terms" className="text-text-secondary hover:text-primary">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


