import type { LucideIcon } from "lucide-react";

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  fullWidth?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
};

export function PrimaryButton({ children, onClick, icon: Icon, fullWidth, type = "button", disabled }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bg-primary text-white rounded-button px-6 py-4 text-base font-semibold shadow-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
        fullWidth ? "w-full" : "w-auto"
      }`}
    >
      {Icon ? <Icon size={20} /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, icon: Icon, fullWidth, type = "button", disabled }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bg-surface text-primary border-2 border-primary rounded-button px-6 py-4 text-base font-semibold hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
        fullWidth ? "w-full" : "w-auto"
      }`}
    >
      {Icon ? <Icon size={20} /> : null}
      {children}
    </button>
  );
}




