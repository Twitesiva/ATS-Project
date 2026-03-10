/**
 * Build segments for resume text with matching skills highlighted.
 * Returns array of { type: 'text' | 'highlight', value: string }.
 * Escapes special regex chars in skill phrases for safe matching.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRanges(text, phrases) {
  const normalizedText = (text || "").toLowerCase();
  const ranges = [];
  for (const phrase of phrases) {
    const p = (phrase || "").trim().toLowerCase();
    if (!p) continue;
    const escaped = escapeRegex(p);
    const re = new RegExp(escaped.replace(/\s+/g, "\\s+"), "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

export function highlightSegments(text, matchingSkills, roleKeywords = []) {
  if (!text) return [{ type: "text", value: "" }];
  
  // Combine skills and role keywords for highlighting
  const allKeywords = [];
  if (Array.isArray(matchingSkills)) {
    allKeywords.push(...matchingSkills.filter(Boolean));
  }
  if (Array.isArray(roleKeywords)) {
    allKeywords.push(...roleKeywords.filter(Boolean));
  }
  
  const ranges = findRanges(text, allKeywords);
  if (ranges.length === 0) return [{ type: "text", value: text }];
  
  const out = [];
  let last = 0;
  for (const [s, e] of ranges) {
    if (s > last) {
      out.push({ type: "text", value: text.slice(last, s) });
    }
    out.push({ type: "highlight", value: text.slice(s, e) });
    last = e;
  }
  if (last < text.length) {
    out.push({ type: "text", value: text.slice(last) });
  }
  return out;
}

// Function to filter and prioritize specific technology skills
function filterAndPrioritizeSkills(skills) {
  if (!skills || !Array.isArray(skills)) return [];
  
  // Define high-priority technology skills that should definitely be highlighted
  const highPrioritySkills = [
    // Programming languages
    "java", "python", "javascript", "typescript", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin",
    // Frameworks & Libraries
    "spring", "spring boot", "react", "angular", "vue", "django", "flask", "express", "node.js", "asp.net", "laravel",
    // Databases
    "mysql", "postgresql", "mongodb", "redis", "oracle", "sql server", "sqlite",
    // Cloud & DevOps
    "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "terraform", "ansible",
    // Tools & Technologies
    "git", "linux", "microservices", "rest", "api", "sql", "nosql",
    // Other specific tech skills
    "hibernate", "spring mvc", "spring security", "mybatis", "jpa", "oauth"
  ];
  
  // Convert to lowercase for comparison
  const lowerPrioritySkills = highPrioritySkills.map(s => s.toLowerCase());
  
  // Filter and sort skills - prioritize high-priority ones
  const highPriorityMatches = skills.filter(skill => 
    lowerPrioritySkills.includes(skill.toLowerCase()) ||
    lowerPrioritySkills.some(prioritySkill => 
      skill.toLowerCase().includes(prioritySkill) && prioritySkill.length >= 3
    )
  );
  
  // For debugging, we can also include some other skills but with lower priority
  // But for now, let's focus only on the high priority ones
  return highPriorityMatches;
}