import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title:'表現スクランブラ — テキストウォーターマーク撹乱実験',
  description:'文体別の同義語辞書と任意のGroq APIを用いる日本語・英語のテキスト摂動実験ツール。文体別の辞書置換とAIによる文脈を考慮した候補生成に対応。',
  icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'},robots:{index:false,follow:false}
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}
