import { describe, it, expect } from 'vitest';
import { mergeNotes, mergeFolders, reconcileNotesDelta } from './merge';
import { Note, Folder } from '../types';

describe('mergeNotes', () => {
  const baseNote: Note = {
    id: '1',
    title: 'Test Note',
    content: 'Content',
    user_id: 'u1',
    folder_id: null,
    version: 1,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z',
    deleted_at: null,
  };

  it('should prefer server note if timestamps are equal', () => {
    const local = { ...baseNote, title: 'Local' };
    const server = { ...baseNote, title: 'Server' };
    
    const result = mergeNotes([local], [server]);
    expect(result[0].title).toBe('Server');
  });

  it('should prefer server note if server is newer', () => {
    const local = { ...baseNote, title: 'Local', updated_at: '2023-01-01T10:00:00Z' };
    const server = { ...baseNote, title: 'Server', updated_at: '2023-01-01T10:00:01Z' }; // Newer
    
    const result = mergeNotes([local], [server]);
    expect(result[0].title).toBe('Server');
  });

  it('should prefer local note if local is newer', () => {
    const local = { ...baseNote, title: 'Local', version: 2, updated_at: '2023-01-01T10:00:02Z' };
    const server = { ...baseNote, title: 'Server', version: 1, updated_at: '2023-01-01T10:00:01Z' };
    
    const result = mergeNotes([local], [server]);
    expect(result[0].title).toBe('Local');
  });

  it('should keep temp notes from local', () => {
    const tempNote = { ...baseNote, id: 'temp-123', title: 'Temp' };
    const serverNote = { ...baseNote, id: '2', title: 'Server Note' };
    
    const result = mergeNotes([tempNote], [serverNote]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(tempNote);
    expect(result).toContainEqual(serverNote);
  });

  it('should remove non-temp local notes that are missing from server', () => {
    const deletedNote = { ...baseNote, id: 'deleted-on-server' };
    const serverNote = { ...baseNote, id: '2' };
    
    const result = mergeNotes([deletedNote], [serverNote]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should remove notes deleted on the server', () => {
    const local = { ...baseNote, title: 'Local' };
    const server = { ...baseNote, deleted_at: '2023-01-01T10:00:03Z' };

    const result = mergeNotes([local], [server]);
    expect(result).toHaveLength(0);
  });
});

describe('reconcileNotesDelta', () => {
  const baseNote: Note = {
    id: '1',
    title: 'Test Note',
    content: 'Content',
    user_id: 'u1',
    folder_id: null,
    version: 1,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z',
    deleted_at: null,
  };

  it('keeps local notes that are absent from the delta', () => {
    const localA = { ...baseNote, id: 'a' };
    const localB = { ...baseNote, id: 'b' };
    const deltaB = { ...baseNote, id: 'b', title: 'B updated', version: 2 };

    const result = reconcileNotesDelta([localA, localB], [deltaB]);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.id === 'a')).toEqual(localA);
    expect(result.find((n) => n.id === 'b')?.title).toBe('B updated');
  });

  it('upserts new notes from the delta', () => {
    const localA = { ...baseNote, id: 'a' };
    const deltaC = { ...baseNote, id: 'c', title: 'New' };

    const result = reconcileNotesDelta([localA], [deltaC]);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.id === 'c')?.title).toBe('New');
  });

  it('removes notes that arrive as tombstones in the delta', () => {
    const localA = { ...baseNote, id: 'a' };
    const localB = { ...baseNote, id: 'b' };
    const tombstoneB = {
      ...baseNote,
      id: 'b',
      version: 2,
      deleted_at: '2023-01-02T10:00:00Z',
    };

    const result = reconcileNotesDelta([localA, localB], [tombstoneB]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('preserves a newer unsynced local edit over an older delta entry', () => {
    const localNewer = {
      ...baseNote,
      id: 'a',
      title: 'Local offline edit',
      version: 3,
      updated_at: '2023-01-05T10:00:00Z',
    };
    const deltaOlder = {
      ...baseNote,
      id: 'a',
      title: 'Stale server',
      version: 2,
      updated_at: '2023-01-03T10:00:00Z',
    };

    const result = reconcileNotesDelta([localNewer], [deltaOlder]);
    expect(result[0].title).toBe('Local offline edit');
  });
});

describe('mergeFolders', () => {
  const baseFolder: Folder = {
    id: '1',
    name: 'Folder',
    user_id: 'u1',
    version: 1,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z',
    deleted_at: null,
  };

  it('should merge folders similar to notes', () => {
    const local = { ...baseFolder, name: 'Local', updated_at: '2023-01-01T12:00:00Z' };
    const server = { ...baseFolder, name: 'Server', updated_at: '2023-01-01T11:00:00Z' }; // Older
    
    const result = mergeFolders([local], [server]);
    expect(result[0].name).toBe('Local');
  });
});
