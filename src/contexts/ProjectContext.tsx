import { createContext, useContext, useState, ReactNode } from "react";

interface Project {
  id: string;
  title: string;
}

interface ProjectContextValue {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProject: null,
  setActiveProject: () => {},
});

const STORAGE_KEY = "fyrescribe_active_project";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [activeProject, setActiveProjectState] = useState<Project | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setActiveProject = (project: Project | null) => {
    setActiveProjectState(project);
    if (project) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useActiveProject = () => useContext(ProjectContext);
