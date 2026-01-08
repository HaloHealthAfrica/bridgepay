import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, CheckCircle, ChevronRight } from "lucide-react";
import { kycAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";

type Step = 1 | 2 | 3;

export function KYC() {
  const navigate = useNavigate();
  const bootstrap = useAuthStore((s) => s.bootstrap);

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("INCOMPLETE");

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("Male");
  const [idType, setIdType] = useState("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");

  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await kycAPI.me();
        setStatus(res.data.data.kyc.status);
      } catch {
        // ignore
      }
    })();
  }, []);

  const progressPct = useMemo(() => ((step - 1) / 2) * 100, [step]);

  const submit = async () => {
    setLoading(true);
    try {
      await kycAPI.submit({
        idType,
        idNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : undefined,
        address,
        files,
      });
      await bootstrap();
      alert("KYC submitted for review!");
      navigate("/settings");
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Failed to submit KYC");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={() => navigate("/settings")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Settings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">KYC Verification</h1>
        <p className="text-text-secondary">Complete your identity verification to unlock all features</p>
        <div className="mt-3 text-sm text-text-secondary">Current status: <span className="font-semibold">{status}</span></div>
      </div>

      {/* Stepper */}
      <div className="relative mb-8">
        <div className="absolute left-12 right-12 top-5 h-[2px] bg-gray-200">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { num: 1 as const, label: "Personal Details" },
            { num: 2 as const, label: "ID Document" },
            { num: 3 as const, label: "Selfie Verification" },
          ].map((it) => {
            const done = step > it.num;
            const active = step >= it.num;
            return (
              <div key={it.num} className="text-center relative z-10">
                <div
                  className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center font-extrabold ${
                    active ? "bg-primary text-white" : "bg-surface border-2 border-gray-200 text-text-secondary"
                  }`}
                >
                  {done ? <Check size={20} /> : it.num}
                </div>
                <div className={`text-xs font-semibold ${active ? "text-primary" : "text-text-secondary"}`}>{it.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 ? (
        <div className="bg-surface rounded-card p-8 border border-gray-200">
          <h2 className="text-xl font-bold mb-6">Personal Information</h2>

          <div className="mb-5">
            <label className="block mb-2 font-semibold">Full Name (as on ID)</label>
            <input
              className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Kamau Mwangi"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block mb-2 font-semibold">Date of Birth</label>
              <input className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div>
              <label className="block mb-2 font-semibold">Gender</label>
              <select className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="mb-5">
            <label className="block mb-2 font-semibold">National ID Number</label>
            <input className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="12345678" />
          </div>

          <div className="mb-6">
            <label className="block mb-2 font-semibold">Residential Address</label>
            <textarea className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your full address..." />
          </div>

          <PrimaryButton icon={ChevronRight} fullWidth onClick={() => setStep(2)}>
            Continue to ID Document
          </PrimaryButton>
        </div>
      ) : null}

      {/* Step 2 */}
      {step === 2 ? (
        <div className="bg-surface rounded-card p-8 border border-gray-200">
          <h2 className="text-xl font-bold mb-2">Upload ID Document</h2>
          <p className="text-text-secondary mb-6">Upload a clear photo of your National ID, Passport, or Driver's License</p>

          <div className="mb-6">
            <label className="block mb-3 font-semibold">Document Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "National ID", value: "NATIONAL_ID" },
                { label: "Passport", value: "PASSPORT" },
                { label: "Driver's License", value: "DRIVERS_LICENSE" },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setIdType(t.value)}
                  className={`p-4 rounded-button border-2 font-semibold ${
                    idType === t.value ? "border-primary bg-primary-light text-primary" : "border-gray-200 bg-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <label className="block">
              <div className="font-semibold mb-2">ID Photos (front/back)</div>
              <input
                type="file"
                multiple
                accept="image/*"
                className="block w-full"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              <div className="text-xs text-text-secondary mt-2">{files.length ? `${files.length} file(s) selected` : "No files selected"}</div>
            </label>

            <div className="bg-blue-50 border border-blue-200 rounded-button p-4 text-sm">
              <div className="font-semibold text-blue-800 mb-2">📸 Photo Tips</div>
              <ul className="list-disc ml-5 text-blue-800/90">
                <li>All text clearly visible</li>
                <li>Good lighting, no shadows</li>
                <li>Capture the entire document</li>
                <li>JPG/PNG up to 5MB each</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <SecondaryButton fullWidth onClick={() => setStep(1)}>
              Back
            </SecondaryButton>
            <PrimaryButton icon={ChevronRight} fullWidth onClick={() => setStep(3)}>
              Continue to Selfie
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {/* Step 3 */}
      {step === 3 ? (
        <div className="bg-surface rounded-card p-8 border border-gray-200">
          <h2 className="text-xl font-bold mb-2">Selfie Verification</h2>
          <p className="text-text-secondary mb-6">Take a selfie to verify your identity matches your ID document</p>

          <div className="border-2 border-dashed border-gray-200 rounded-card p-10 text-center bg-background mb-6">
            <Camera size={64} className="text-text-secondary mx-auto mb-4" />
            <div className="text-lg font-semibold mb-2">Take or Upload Selfie</div>
            <div className="text-sm text-text-secondary mb-4">Make sure your face is clearly visible</div>
            <SecondaryButton icon={Camera} onClick={() => alert("Camera capture (next)")}>
              Open Camera
            </SecondaryButton>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-button p-4 mb-6 text-sm">
            <div className="font-semibold text-success mb-2">✓ Selfie Guidelines</div>
            <ul className="list-disc ml-5">
              <li>Face the camera directly</li>
              <li>Remove glasses and hats</li>
              <li>Use natural lighting</li>
              <li>Neutral expression works best</li>
              <li>Match the photo on your ID</li>
            </ul>
          </div>

          <div className="flex gap-3 flex-wrap">
            <SecondaryButton fullWidth onClick={() => setStep(2)}>
              Back
            </SecondaryButton>
            <PrimaryButton icon={CheckCircle} fullWidth onClick={submit} disabled={loading}>
              {loading ? "Submitting..." : "Submit for Verification"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}


