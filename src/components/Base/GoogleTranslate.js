"use client";
import React, { useEffect, useState, useRef } from "react";
import { Button, Dropdown, Space, Typography } from "antd";
import { GlobalOutlined, CheckOutlined } from "@ant-design/icons";

const { Text } = Typography;

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hi", label: "हिंदी", flag: "🇮🇳" },
  { code: "gu", label: "ગુજરાતી", flag: "🇮🇳" },
];

const GoogleTranslate = () => {
  const [active, setActive] = useState(LANGUAGES[0]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!document.getElementById("google-translate-script")) {
      const s = document.createElement("script");
      s.id = "google-translate-script";
      s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      document.body.appendChild(s);
    }

    window.googleTranslateElementInit = () => {
      if (window.google?.translate) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: "en,hi,gu",
            autoDisplay: false,
          },
          "google_translate_element"
        );
      }
    };
  }, []);

  const switchLang = (lang) => {
    setActive(lang);

    if (lang.code === "en") {
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      window.location.reload();
      return;
    }

    const sel = document.querySelector(".goog-te-combo");
    if (sel) {
      sel.value = lang.code;
      sel.dispatchEvent(new Event("change"));
    }
  };

  const items = LANGUAGES.map((lang) => ({
    key: lang.code,
    label: (
      <Space style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Space>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{lang.flag}</span>
          <span>{lang.label}</span>
        </Space>
        {active.code === lang.code && (
          <CheckOutlined style={{ color: "var(--ant-color-primary, #667eea)", fontSize: 14 }} />
        )}
      </Space>
    ),
    onClick: () => switchLang(lang),
  }));

  return (
    <>
      <div id="google_translate_element" style={{ display: "none" }} />
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
        <Button
          type="text"
          icon={<GlobalOutlined style={{ fontSize: 18 }} />}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-primary)" }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, marginRight: 2 }}>{active.flag}</span>
          <Text style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1 }}>
            {active.label}
          </Text>
        </Button>
      </Dropdown>
    </>
  );
};

export default GoogleTranslate;
