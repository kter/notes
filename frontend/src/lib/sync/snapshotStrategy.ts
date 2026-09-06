/**
 * ワークスペース読み込み時に「サーバーから何を取るか」を決める規則。
 *
 * 主なエクスポート:
 * - SnapshotStrategy: 取得方針の閉じた種別
 * - chooseSnapshotStrategy: ローカルキャッシュとカーソルから方針を決める
 *
 * 呼び出し関係: useWorkspaceSnapshotState から呼ばれる。
 *
 * このモジュールが存在する理由:
 *   マージの原始関数（mergeNotes / reconcileNotesDelta）には手厚いユニットテストが
 *   あるのに、そのどちらを使うかを決める分岐にはテストが 1 つも無かった。実際に
 *   壊れうるのは「差分にするか全件にするか」の判断のほうで、そこは 700 行近い
 *   フックのマウント副作用の中にあり、名前も付いていなかった。
 *
 *   判断に名前を与えて切り出し、フック側は結果に従うだけにする。
 */

export type SnapshotStrategy =
  /** オフライン。ローカルキャッシュだけで表示し、サーバーへは行かない。 */
  | { kind: "localOnly" }
  /** カーソル以降の差分だけを取得する。tombstone を含む。 */
  | { kind: "delta"; cursor: string }
  /** 全件取得してローカルとマージする。初回、またはカーソルが無いとき。 */
  | { kind: "full" };

interface SnapshotContext {
  /** ローカル IndexedDB にキャッシュが 1 件でもあるか */
  hasLocalCache: boolean;
  /** 保存済みの同期カーソル。未保存なら null */
  cursor: string | null;
  isOnline: boolean;
}

/**
 * ローカルキャッシュとカーソルの有無から取得方針を決める。
 *
 * 差分取得はカーソルとローカルキャッシュの両方が揃っているときだけ成立する。
 * カーソルがあってもキャッシュが空なら（別ブラウザでのクリア、ストレージの
 * 追い出しなど）差分だけでは表示が空になるため、全件取得へ落とす。
 */
export function chooseSnapshotStrategy({
  hasLocalCache,
  cursor,
  isOnline,
}: SnapshotContext): SnapshotStrategy {
  if (!isOnline) return { kind: "localOnly" };
  if (cursor !== null && hasLocalCache) return { kind: "delta", cursor };
  return { kind: "full" };
}
