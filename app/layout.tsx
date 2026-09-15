import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'AI Video Director · 商业视频创作',description:'从一个参考，到三种创意。AI 商业视频导演工作台。'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
