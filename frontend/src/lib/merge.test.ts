import { describe, it, expect } from 'vitest';
import { mergeNotes, mergeFolders } from './merge';
import { Note, Folder } from '../types';

describe('mergeNotes', () => {
  const baseNote: Note = {
    id: '1',
    title: 'Test Note',
    content: 'Content',
    user_id: 'u1',
    folder_id: null,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z',
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
    const local = { ...baseNote, title: 'Local', updated_at: '2023-01-01T10:00:02Z' }; // Newer
    const server = { ...baseNote, title: 'Server', updated_at: '2023-01-01T10:00:01Z' };
    
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
});

describe('mergeFolders', () => {
  const baseFolder: Folder = {
    id: '1',
    name: 'Folder',
    user_id: 'u1',
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z',
  };

  it('should merge folders similar to notes', () => {
    const local = { ...baseFolder, name: 'Local', updated_at: '2023-01-01T12:00:00Z' };
    const server = { ...baseFolder, name: 'Server', updated_at: '2023-01-01T11:00:00Z' }; // Older
    
    const result = mergeFolders([local], [server]);
    expect(result[0].name).toBe('Local');
  });
});
