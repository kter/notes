/**
 * ローカルとサーバーのエンティティをバージョン・タイムスタンプ基準でマージするユーティリティ。
 * オフライン時のローカル変更をサーバースナップショットと競合解決しながら統合する。
 *
 * 主なエクスポート:
 * - mergeNotes: ノートリストをマージして返す
 * - mergeFolders: フォルダリストをマージして返す
 *
 * 呼び出し関係: workspaceSync やスナップショット取得後の状態統合処理から使用される。
 */
import type { Folder, Note } from "@/types";

/**
 * "temp-" プレフィックスを持つ、まだサーバーに未登録のエンティティかを判定する。
 */
function isTempEntity(id: string): boolean {
  return id.startsWith("temp-");
}

/**
 * deleted_at が設定されている論理削除済みエンティティかを判定する。
 */
function isDeletedEntity<T extends { deleted_at: string | null }>(entity: T): boolean {
  return entity.deleted_at !== null;
}

/**
 * ローカルエンティティがサーバーエンティティより新しいかを判定する。
 * まず version を比較し、同一の場合は updated_at タイムスタンプで決定する。
 */
function isLocalEntityNewer<T extends { version: number; updated_at: string }>(
  localEntity: T,
  serverEntity: T
): boolean {
  if (localEntity.version !== serverEntity.version) {
    return localEntity.version > serverEntity.version;
  }

  return (
    new Date(localEntity.updated_at).getTime() >
    new Date(serverEntity.updated_at).getTime()
  );
}

/**
 * ローカルとサーバーのエンティティリストを競合解決しながらマージする汎用関数。
 * サーバー側を基準に展開し、ローカルの temp エンティティや更新が新しいエンティティで上書きする。
 * 論理削除済みエンティティはマージ結果から除外する。
 */
function mergeWorkspaceEntities<T extends {
  id: string;
  version: number;
  updated_at: string;
  deleted_at: string | null;
}>(localEntities: T[], serverEntities: T[]): T[] {
  const mergedMap = new Map<string, T>();

  // サーバー側の非削除エンティティをベースとしてマップに展開する
  for (const serverEntity of serverEntities) {
    if (!isDeletedEntity(serverEntity)) {
      mergedMap.set(serverEntity.id, serverEntity);
    }
  }

  for (const localEntity of localEntities) {
    // ローカルで論理削除済みのものはスキップ
    if (isDeletedEntity(localEntity)) {
      continue;
    }

    if (isTempEntity(localEntity.id)) {
      // temp エンティティはサーバーにまだ存在しない場合のみ追加する
      if (!mergedMap.has(localEntity.id)) {
        mergedMap.set(localEntity.id, localEntity);
      }
      continue;
    }

    const serverEntity = serverEntities.find((entity) => entity.id === localEntity.id);

    if (serverEntity && !isDeletedEntity(serverEntity)) {
      // ローカルの方が新しい場合はローカルで上書きする（オフライン編集の競合解決）
      if (isLocalEntityNewer(localEntity, serverEntity)) {
        mergedMap.set(localEntity.id, localEntity);
      }
      continue;
    }
  }

  return Array.from(mergedMap.values());
}

export function mergeNotes(localNotes: Note[], serverNotes: Note[]): Note[] {
  return mergeWorkspaceEntities(localNotes, serverNotes);
}

export function mergeFolders(localFolders: Folder[], serverFolders: Folder[]): Folder[] {
  return mergeWorkspaceEntities(localFolders, serverFolders);
}
