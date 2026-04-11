import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
