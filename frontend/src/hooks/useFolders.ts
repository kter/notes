"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Folder } from "@/types";

interface UseFoldersReturn {
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  handleCreateFolder: (name: string) => Promise<void>;
  handleRenameFolder: (id: string, name: string) => Promise<void>;
  handleDeleteFolder: (id: string) => Promise<void>;
}

export function useFolders(
  getAccessToken: () => Promise<string | null>,
  selectedFolderId: string | null,
  setSelectedFolderId: (id: string | null) => void
): UseFoldersReturn {
  const [folders, setFolders] = useState<Folder[]>([]);

  const handleCreateFolder = async (name: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const folder = await api.createFolder({ name });
      setFolders((prev) => [folder, ...prev]);
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const folder = await api.updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      await api.deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
  };

  return {
    folders,
    setFolders,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  };
}
