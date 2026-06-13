import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.house.management',
  appName: '房屋管理',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
