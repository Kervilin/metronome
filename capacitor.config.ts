import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.prototype.metronome",
  appName: "Métronome",
  webDir: "dist",
  backgroundColor: "#050506",
  android: {
    allowMixedContent: false,
  },
};

export default config;
