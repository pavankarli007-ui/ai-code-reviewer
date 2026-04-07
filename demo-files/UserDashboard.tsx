// UserDashboard.tsx — Demo file for AI Code Reviewer showcase
// Contains intentional issues across security, performance, and quality.
// Run `git add -N src/UserDashboard.tsx` then press Cmd+Shift+R to see the magic.

import React, { useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  bio: string;
}

interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
}

interface Props {
  userId: string;
  adminSecret: string; // ❌ ISSUE: secret passed as prop
}

const UserDashboard: React.FC<Props> = ({ userId, adminSecret }) => {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("");

  // ❌ ISSUE: Missing userId in dependency array — stale closure
  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => setUser(data));
    // no error handling either
  }, []);

  // ❌ ISSUE: No debounce + missing deps array = fires on every render
  useEffect(() => {
    fetch(`/api/posts?q=${search}`)
      .then((res) => res.json())
      .then(setPosts);
  });

  const handleLogin = async (password: string) => {
    // ❌ ISSUE: SQL-like string interpolation in API call
    const res = await fetch(`/api/login?user=${userId}&pass=${password}`);
    const data = await res.json();

    // ❌ ISSUE: Storing JWT in localStorage — XSS vulnerable
    localStorage.setItem("auth_token", data.token);
    setToken(data.token);

    // ❌ ISSUE: Logging sensitive data to console
    console.log("Logged in:", data.token, adminSecret);
  };

  // ❌ ISSUE: XSS — dangerouslySetInnerHTML with unescaped user content
  const renderBio = (bio: string) => (
    <div dangerouslySetInnerHTML={{ __html: bio }} />
  );

  // ❌ ISSUE: useCallback with wrong deps — handleSearch is recreated every render
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, [token]); // token is not relevant here

  return (
    <div className="dashboard">
      <h1>Welcome {user?.name}</h1>

      <input
        value={search}
        onChange={handleSearch}
        placeholder="Search posts..."
      />

      <div className="posts">
        {/* ❌ ISSUE: Missing key prop */}
        {posts.map((post) => (
          <div className="post-card">
            <h3>{post.title}</h3>
            {renderBio(post.content)}
          </div>
        ))}
      </div>

      {/* ❌ ISSUE: Admin check on frontend only — never trust client-side auth */}
      {user?.role === "admin" && (
        <button onClick={() => fetch(`/api/admin?secret=${adminSecret}`)}>
          Admin Panel
        </button>
      )}
    </div>
  );
};

export default UserDashboard;
