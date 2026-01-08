/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#00796B",
        "primary-light": "#E0F2F1",
        "primary-dark": "#004D40",
        success: "#4CAF50",
        warning: "#FF9800",
        error: "#F44336",
        background: "#F5F5F5",
        surface: "#FFFFFF",
        text: "#212121",
        "text-secondary": "#757575",
      },
      borderRadius: {
        card: "16px",
        button: "12px",
      },
      boxShadow: {
        button: "0 2px 8px rgba(0,121,107,0.2)",
        card: "0 2px 4px rgba(0,0,0,0.1)",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}

