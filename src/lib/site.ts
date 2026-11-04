import type { Category } from "./post-schema";

export const SITE = {
  name: "আবু আয়েশা",
  nameEn: "Abu Aaisha",
  tagline: "ব্লগ ও ইসলামিক কাউন্সেলিং",
  description:
    "সমকালীন মুসলিম জীবন, পরিবার ও সমাজ নিয়ে লেখা এবং পারিবারিক ও ব্যক্তিগত বিষয়ে আন্তরিক পরামর্শ।",
  email: "contact@abuaaisha.com",
  // TODO(owner): confirm these handles — they are the ones shown in the Figma design.
  linkedin: { label: "/in/abuaaisha", url: "https://www.linkedin.com/in/abuaaisha" },
  youtube: { label: "@abuaaisha", url: "https://www.youtube.com/@abuaaisha" },
  ogImage: "/images/site/hero-desk.webp",
  postsPerPage: 12,
} as const;

export const NAV = [
  { href: "/", label: "হোম" },
  { href: "/posts/", label: "ব্লগ" },
  { href: "/counseling/", label: "ইসলামিক কাউন্সেলিং" },
  { href: "/about/", label: "পরিচিতি" },
] as const;

export const CATEGORY_META: Record<Category, { label: string; icon: string; blurb: string }> = {
  faith: { label: "ঈমান", icon: "moon", blurb: "আকীদা, ফিকহ ও ইবাদত নিয়ে প্রশ্ন" },
  social: { label: "সমাজ", icon: "users", blurb: "পরিবার, সন্তান ও সমকালীন সংকট" },
  worldview: { label: "বিশ্বদৃষ্টি", icon: "globe", blurb: "সেক্যুলার চিন্তা ও মুসলিম পরিচয়" },
};

export const CONTACT_SUBJECTS = [
  "কাউন্সেলিং সেশন সম্পর্কে",
  "সেশন বুকিং: সংক্ষিপ্ত সেশন",
  "সেশন বুকিং: পূর্ণাঙ্গ সেশন",
  "সেশন বুকিং: সরাসরি সাক্ষাৎ",
  "লেখা সম্পর্কে মতামত",
  "অন্যান্য",
] as const;
