import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Hybrid Capacitor shell: the native app WebView loads the live Next.js site.
 * This keeps SSR, API routes, auth, and Stripe working without a static export.
 *
 * Local device against `next dev`:
 *   CAP_SERVER_URL=http://YOUR_LAN_IP:3000 npx cap run ios
 */
const serverUrl =
  process.env.CAP_SERVER_URL?.trim() || "https://www.rithmgen.co.uk";

const config: CapacitorConfig = {
  appId: "uk.co.rithmgen.app",
  appName: "RithmGen",
  webDir: "native-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "rithmgen.co.uk",
      "*.rithmgen.co.uk",
      "*.supabase.co",
      "*.stripe.com",
      "*.youtube.com",
      "*.youtu.be",
      "*.google.com",
      "*.googleapis.com",
      "*.gstatic.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#07040f",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#07040f",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#07040f",
    scheme: "RithmGen",
  },
  android: {
    backgroundColor: "#07040f",
    allowMixedContent: true,
  },
};

export default config;
