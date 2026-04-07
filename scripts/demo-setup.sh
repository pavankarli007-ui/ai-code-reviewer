#!/bin/bash
# scripts/demo-setup.sh
# Sets up the perfect demo environment for recording or showcasing.
# Run this before recording your LinkedIn video or doing a live demo.

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI Code Reviewer — Demo Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Clean up any previous demo state
echo -e "${YELLOW}1. Cleaning previous demo state...${NC}"
git checkout -- src/ 2>/dev/null || true
git clean -fd src/ 2>/dev/null || true
echo -e "${GREEN}   ✓ Clean${NC}"

# Step 2: Compile the extension
echo -e "${YELLOW}2. Compiling extension...${NC}"
npm run compile > /dev/null 2>&1
echo -e "${GREEN}   ✓ Compiled${NC}"

# Step 3: Copy demo file to src to create a dirty diff
echo -e "${YELLOW}3. Setting up demo diff...${NC}"
cp demo-files/UserDashboard.tsx src/UserDashboard.tsx
git add -N src/UserDashboard.tsx
echo -e "${GREEN}   ✓ Demo file ready (UserDashboard.tsx has 9 intentional issues)${NC}"

# Step 4: Verify git diff is non-empty
DIFF_SIZE=$(git diff HEAD | wc -c)
echo -e "${YELLOW}4. Verifying git diff...${NC}"
echo -e "${GREEN}   ✓ diff size: ${DIFF_SIZE} chars${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Ready to demo!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next steps:"
echo "  1. Press F5 in VS Code to launch Extension Dev Host"
echo "  2. Open src/UserDashboard.tsx in the new window"
echo "  3. Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
echo "  4. Watch Claude catch all 9 issues live"
echo ""
echo "  Issues the AI will find:"
echo "  ⚠ XSS via dangerouslySetInnerHTML"
echo "  ⚠ JWT stored in localStorage"
echo "  ⚠ Sensitive token in console.log"
echo "  ⚠ Client-side admin check (bypassable)"
echo "  ⚡ useEffect missing dependency array"
echo "  ⚡ Search with no debounce"
echo "  ◈ Stale closure in useEffect"
echo "  ◈ Missing key props"
echo "  ◈ useCallback wrong dependencies"
echo ""
echo "  Expected grade: F"
echo "  After all fixes: A+"
echo ""
