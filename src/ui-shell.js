export function renderProjectList(root, projects, {onSelect = () => {}} = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("root must be a DOM element");
  }
  const document = root.ownerDocument;
  const section = document.createElement("section");
  section.className = "studio-core-projects";
  const heading = document.createElement("h1");
  heading.textContent = "Projects";
  const list = document.createElement("ul");
  for (const project of projects) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = project.name || project.id;
    button.addEventListener("click", () => onSelect(project));
    item.append(button);
    list.append(item);
  }
  section.append(heading, list);
  root.replaceChildren(section);
  return section;
}
