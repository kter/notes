"use client";

import { useState } from "react";
import { useApi } from "./useApi";
import type { Folder } from "@/types";

interface UseFoldersReturn {
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  handleCreateFolder: (name: string) => Promise<void>;
  handleRenameFolder: (id: string, name: string) => Promise<void>;
  handleDeleteFolder: (id: string) => Promise<void>;
}

export function useFolders(
  folders: Folder[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  selectedFolderId: string | null,
  setSelectedFolderId: (id: string | null) => void
): UseFoldersReturn {
  const { getApi } = useApi();

  const handleCreateFolder = async (name: string) => {
    try {
      const apiClient = await getApi();
      const folder = await apiClient.createFolder({ name });
      setFolders((prev) => [folder, ...prev]);
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const apiClient = await getApi();
      const folder = await apiClient.updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const apiClient = await getApi();
      await apiClient.deleteFolder(id);
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
