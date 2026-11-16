(function () {
  const root = document.documentElement;
  const themeButton = document.getElementById("theme-toggle");
  const languageButton = document.getElementById("language-toggle");

  const GITHUB_OWNER = "aref-asadi";
  const GITHUB_REPO = "portfolio";
  const GITHUB_BRANCH = "main";

  function savePreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function readPreference(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme;
    const isDark = theme === "dark";
    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(isDark));
      themeButton.innerHTML = isDark
        ? '<span class="en">Light mode</span><span class="fa">حالت روشن</span>'
        : '<span class="en">Dark mode</span><span class="fa">حالت تاریک</span>';
    }
    if (persist) savePreference("theme", theme);
  }

  function setLanguage(language, persist) {
    const isPersian = language === "fa";
    root.lang = language;
    root.dir = isPersian ? "rtl" : "ltr";
    if (languageButton) {
      languageButton.textContent = isPersian ? "English" : "فارسی";
      languageButton.lang = isPersian ? "en" : "fa";
      languageButton.setAttribute(
        "aria-label",
        isPersian ? "Switch to English" : "تغییر زبان به فارسی"
      );
    }
    if (persist) savePreference("language", language);
    window.dispatchEvent(new CustomEvent("site:languagechange", { detail: { language } }));
  }

  if (themeButton) {
    themeButton.addEventListener("click", function () {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
  }

  if (languageButton) {
    languageButton.addEventListener("click", function () {
      setLanguage(root.lang === "fa" ? "en" : "fa", true);
    });
  }

  const savedTheme = readPreference("theme");
  const savedLanguage = readPreference("language");
  setTheme(savedTheme === "dark" ? "dark" : "light", false);
  setLanguage(savedLanguage === "fa" ? "fa" : "en", false);

  // Highlight active navigation link
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-bar a").forEach(function (link) {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "post.html" && href === "blog.html")) {
      link.setAttribute("aria-current", "page");
    }
  });

  // Convert YYYY-MM-DD to Jalali (Solar Hijri) string for Persian mode
  function formatDisplayDate(dateStr, isPersian) {
    if (!dateStr) return "";
    if (!isPersian) return dateStr;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateStr;
    try {
      const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(d);
    } catch (e) {
      return dateStr;
    }
  }

  async function fetchAllBlogPosts() {
    const cacheKey = "pg_blog_posts_cache_v1";
    const cacheTimeKey = "pg_blog_posts_cache_time_v1";
    const now = Date.now();

    try {
      const cached = sessionStorage.getItem(cacheKey);
      const cachedTime = Number(sessionStorage.getItem(cacheTimeKey) || 0);
      if (cached && now - cachedTime < 60000) {
        return JSON.parse(cached);
      }
    } catch (e) {}

    let fileList = [];
    try {
      const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/blog?ref=${GITHUB_BRANCH}`;
      const res = await fetch(apiUrl, { headers: { Accept: "application/vnd.github.v3+json" } });
      if (res.ok) {
        const items = await res.json();
        fileList = items
          .filter((item) => item.type === "file" && item.name.endsWith(".json"))
          .map((item) => ({
            slug: item.name.replace(/\.json$/, ""),
            path: `blog/${item.name}`,
            downloadUrl: item.download_url,
          }));
      }
    } catch (e) {}

    if (fileList.length === 0) {
      fileList = [{ slug: "welcome", path: "blog/welcome.json", downloadUrl: null }];
    }

    const posts = await Promise.all(
      fileList.map(async function (file) {
        try {
          let r = await fetch(file.path);
          if (!r.ok && file.downloadUrl) {
            r = await fetch(file.downloadUrl);
          }
          if (!r.ok) return null;
          const data = await r.json();
          if (data.published === false) return null;
          return {
            slug: file.slug,
            title_en: data.title_en || data.title_fa || file.slug,
            title_fa: data.title_fa || data.title_en || file.slug,
            summary_en: data.summary_en || "",
            summary_fa: data.summary_fa || "",
            date: data.date || "",
            body_en: data.body_en || "",
            body_fa: data.body_fa || "",
          };
        } catch (err) {
          return null;
        }
      })
    );

    const validPosts = posts
      .filter(Boolean)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(validPosts));
      sessionStorage.setItem(cacheTimeKey, String(now));
    } catch (e) {}

    return validPosts;
  }

  function renderSimpleMarkdown(text) {
    if (!text) return "";
    if (window.marked && typeof window.marked.parse === "function") {
      return window.marked.parse(text);
    }
    return text
      .split(/\n{2,}/)
      .map((block) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("### ")) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
        if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
        if (trimmed.startsWith("> ")) return `<blockquote>${escapeHtml(trimmed.slice(2))}</blockquote>`;
        return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function makeExcerpt(post, isPersian) {
    const explicit = isPersian ? post.summary_fa : post.summary_en;
    if (explicit) return explicit;
    const raw = (isPersian ? post.body_fa : post.body_en) || "";
    const plain = raw.replace(/[#>*_`[\]()]/g, "").trim();
    return plain.length > 160 ? plain.slice(0, 160) + "…" : plain;
  }

  window.SiteBlog = {
    fetchAllBlogPosts,
    renderSimpleMarkdown,
    makeExcerpt,
    escapeHtml,
    formatDisplayDate,
  };
})();
