document.addEventListener("DOMContentLoaded", () => {
  const addUserButton = document.getElementById("addUserButton");
  const userModal = document.getElementById("userModal");
  const userForm = document.getElementById("userForm");
  const userList = document.getElementById("userList");

  const API_URL = "https://bradspelsmeny-backend.onrender.com/users";

  addUserButton.onclick = () => {
    userForm.reset();
    userForm.dataset.editingId = "";
    userModal.style.display = "flex";
  };

  userModal.addEventListener("click", (e) => {
    if (e.target === userModal) userModal.style.display = "none";
  });

  userForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(userForm);
    const editingId = userForm.dataset.editingId;
    const url = editingId ? `${API_URL}/${editingId}` : API_URL;
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      body: formData
    });

    if (res.ok) {
      loadUsers();
      userModal.style.display = "none";
    } else {
      alert("Något gick fel vid sparandet av användare.");
    }
  };

  async function deleteUser(id) {
    if (!confirm("Är du säker på att du vill radera den här användaren?")) return;

    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadUsers();
    } else {
      alert("Kunde inte radera användaren.");
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch");
      const users = await res.json();
      users.sort((a, b) => a.last_name.localeCompare(b.last_name));
      userList.innerHTML = "";

      users.forEach(user => {
        const card = document.createElement("div");
        card.className = "user-card";

        const header = document.createElement("div");
        header.className = "user-header";

        const title = document.createElement("div");
        title.className = "user-title";
        title.textContent = `${user.first_name} ${user.last_name}`;

        const buttons = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "edit-button";
        editBtn.textContent = "✏️";
        editBtn.onclick = () => {
          userForm.reset();
          userForm.dataset.editingId = user.id;
          userForm.username.value = user.username || "";
          userForm.password.value = ""; // do not prefill password
          userForm.firstName.value = user.first_name;
          userForm.lastName.value = user.last_name;
          userForm.phone.value = user.phone;
          userForm.email.value = user.email || "";
          userForm.idNumber.value = user.id_number || "";
          userModal.style.display = "flex";
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-button";
        deleteBtn.textContent = "🗑️";
        deleteBtn.onclick = () => deleteUser(user.id);

        buttons.appendChild(editBtn);
        buttons.appendChild(deleteBtn);
        header.appendChild(title);
        header.appendChild(buttons);
        card.appendChild(header);
        userList.appendChild(card);
      });
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  loadUsers();
});
