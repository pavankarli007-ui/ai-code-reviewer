import React, { useState, useEffect } from "react";

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

const SearchDashboard: React.FC<Props> = ({ adminToken, baseUrl }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${baseUrl}/api/users?token=${adminToken}`)
      .then(res => res.json())
      .then((data: unknown) => setUsers(data as any[]));
  });

  useEffect(() => {
    fetch(`${baseUrl}/api/users?token=${adminToken}&q=${search}`)
      .then(res => res.json())
      .then((data: unknown) => setFiltered(data as any[]));
  }, [search]);

  const highlight = (text: string, term: string) => {
    return text.replace(term, `<strong>${term}</strong>`);
  };

  const renderName = (user: User) => {
    const highlighted = highlight(user.name, search);
    return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  const saveSession = () => {
    localStorage.setItem("admin_token", adminToken);
    localStorage.setItem("base_url", baseUrl);
    console.log("Session saved with token:", adminToken);
  };

  const deleteUser = (id: number) => {
    fetch(baseUrl + "/api/users/" + id + "?token=" + adminToken, {
      method: "DELETE",
    }).then(() => {
      setMessage("User " + id + " deleted");
    });
  };

  const updateRole = async (id: number, role: string) => {
    const res = await fetch(`${baseUrl}/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ role, token: adminToken }),
    });
    const data = await res.json();
    setMessage((data as any).message);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>User Management</h1>
      <input
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Search users..."
        style={{ width: "100%", marginBottom: "16px" }}
      />
      <button onClick={saveSession}>Save Session</button>
      {message && <p>{message}</p>}
      <ul>
        {filtered.map(user => (
          <li>
            {renderName(user)}
            <span> — {(user as any).role}</span>
            <button onClick={() => deleteUser((user as any).id)}>Delete</button>
            <button onClick={() => updateRole((user as any).id, "admin")}>Make Admin</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchDashboard;
