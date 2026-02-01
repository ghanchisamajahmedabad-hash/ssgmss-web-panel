import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { App, ConfigProvider } from 'antd';
import { themeAntd } from "@/constent/antdTheme";
import { AuthProvider } from "@/components/Base/AuthProvider";
import MainLayout from "@/components/Base/MainLayout";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Marriage Trust Admin Panel",
  description: "Admin panel for marriage trust NGO management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
        <ConfigProvider 
          theme={themeAntd}
        >
           <App>
            <MainLayout>
          {children}
            </MainLayout>
           </App>
        </ConfigProvider>
         
        </AuthProvider>
      </body>
    </html>
  );
}