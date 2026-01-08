import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Save } from "lucide-react";
import { accountAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";

export function EditProfile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const onSave = async () => {
    setLoading(true);
    try {
      await accountAPI.updateMe({ name, email, phone });
      await bootstrap();
      alert("Profile updated!");
      navigate("/settings");
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={() => navigate("/settings")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Settings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Edit Profile</h1>
        <p className="text-text-secondary">Update your personal information</p>
      </div>

      <div className="bg-surface rounded-card p-6 border border-gray-200">
        <div className="text-center mb-8">
          <div className="w-28 h-28 bg-primary-light rounded-full mx-auto mb-4 flex items-center justify-center text-4xl font-extrabold text-primary">
            {initials || "U"}
          </div>
          <SecondaryButton icon={Camera} onClick={() => alert("Photo upload (next)")}>
            Change Photo
          </SecondaryButton>
        </div>

        <div className="mb-5">
          <label className="block mb-2 font-semibold">Full Name</label>
          <input className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="mb-5">
          <label className="block mb-2 font-semibold">Email Address</label>
          <input className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="mb-6">
          <label className="block mb-2 font-semibold">Phone Number</label>
          <input className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <SecondaryButton fullWidth onClick={() => navigate("/settings")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton fullWidth icon={Save} onClick={onSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}




