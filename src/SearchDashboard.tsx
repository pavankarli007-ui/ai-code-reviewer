import React, { useCallback, useEffect, useMemo, useState } from "react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Props {
  adminToken: string;
  baseUrl: string;
}

const containerStyle = { padding: "20px", fontFamily: "sans-serif" };
const inputStyle = { width: "100%", marginBottom: "16px" };
const errorStyle = { color: "red" };

const SearchDashboard: React.FC<Props> = ({ adminToken, baseUrl }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  }), [adminToken]);

  useEffect(() => {
    setLoading(true);
    fetch(`${baseUrl}/api/users`, { headers: authHeaders })
      .then(res => {
        if (!res.ok) { throw new Error("Failed to fetch users"); }
        return res.json();
      })
      .then((data: unknown) => { setUsers(data as User[]); setLoading(false); })
      .catch(err => { setError((err as Error).message); setLoading(false); });
  }, [baseUrl, authHeaders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!search) { setFiltered(users); return; }
      fetch(`${baseUrl}/api/users?q=${encodeURIComponent(search)}`, { headers: authHeaders })
        .then(res => {
          if (!res.ok) { throw new Error("Search failed"); }
          return res.json();
        })
        .then((data: unknown) => setFiltered(data as User[]))
        .catch(err => setError((err as Error).message));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, baseUrl, authHeaders, users]);

  const renderName = useCallback((user: User) => {
    if (!search) { return <span>{user.name}</span>; }
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = user.name.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <span>
        {parts.map((p, i) =>
          p.toLowerCase() === search.toLowerCase()
            ? <strong key={i}>{p}</strong>
            : p
        )}
      </span>
    );
  }, [search]);

  const deleteUser = useCallback((id: number) => {
    fetch(`${baseUrl}/api/users/${id}`, { method: "DELETE", headers: authHeaders })
      .then(res => {
        if (!res.ok) { throw new Error("Delete failed"); }
        setMessage(`User ${id} deleted`);
        setUsers(prev => prev.filter(u => u.id !== id));
        setError("");
      })
      .catch(err => setError((err as Error).message));
  }, [baseUrl, authHeaders]);

  const updateRole = useCallback(async (id: number, role: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/users/${id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { throw new Error("Update failed"); }
      const data = await res.json() as { message: string };
      setMessage(data.message);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [baseUrl, authHeaders]);

  if (loading) { return <div style={containerStyle}>Loading...</div>; }

  return (
    <div style={containerStyle}>
      <h1>User Management</h1>
      {error && <p style={errorStyle}>{error}</p>}
      <input
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Search users..."
        style={inputStyle}
      />
      {message && <p>{message}</p>}
      <ul>
        {filtered.map(user => (
          <li key={user.id}>
            {renderName(user)}
            <span> — {user.role}</span>
            <button onClick={() => deleteUser(user.id)}>Delete</button>
            <button onClick={() => updateRole(user.id, "admin")}>Make Admin</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchDashboard;
