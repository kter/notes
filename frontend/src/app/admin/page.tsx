/**
 * 管理画面のルートページ。AdminConsole コンポーネントをそのまま描画する。
 *
 * 主なエクスポート:
 * - AdminPage: Next.js App Router のデフォルトエクスポートページ
 *
 * 呼び出し関係: /admin パスへのアクセス時に Next.js が自動的に描画する。
 */
import { AdminConsole } from "@/components/admin/AdminConsole";

export default function AdminPage() {
  return <AdminConsole />;
}
