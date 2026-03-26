import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import type { Adapter, PostContent, PostResult } from "./types.js";
import type { BlogConfig } from "../config/schema.js";

export class BlogGitAdapter implements Adapter {
  name = "Blog";
  maxTextLength = 100_000;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = true;
  language: string | undefined;

  constructor(
    private config: BlogConfig,
    private options?: { slug?: string; title?: string; tags?: string[] },
  ) {
    this.language = config.language;
  }

  formatText(text: string): string {
    return text;
  }

  async validate(): Promise<boolean> {
    if (!this.config.content_dir) return false;
    return existsSync(this.config.content_dir);
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      if (!this.config.content_dir) {
        throw new Error("content_dir not configured");
      }

      const slug = this.options?.slug ?? `post-${Date.now()}`;
      const ext = this.config.type === "mdx" ? "mdx" : "md";
      const postDir = join(this.config.content_dir, slug);
      mkdirSync(postDir, { recursive: true });

      // Generate frontmatter
      const title = this.options?.title ?? content.text.split("\n")[0].slice(0, 100);
      const tags = this.options?.tags ?? [];
      const date = new Date().toISOString().split("T")[0];
      const lang = content.language ?? this.config.language ?? "en";

      const frontmatter = [
        "---",
        `title: "${title.replace(/"/g, '\\"')}"`,
        `date: "${date}"`,
        `slug: "${slug}"`,
        `language: "${lang}"`,
        tags.length > 0 ? `tags: [${tags.map((t) => `"${t}"`).join(", ")}]` : null,
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      let body = content.markdown ?? content.text;

      // Replace any non-relative image URLs the AI may have generated
      // with actual relative paths to saved images (./image-0.png, ./image-1.png, etc.)
      if (content.images && content.images.length > 0) {
        let imgIndex = 0;
        body = body.replace(
          /!\[([^\]]*)\]\((?!\.\/image-\d+\.png)([^)]+)\)/g,
          (_match, alt) => {
            const idx = imgIndex < content.images!.length ? imgIndex : content.images!.length - 1;
            imgIndex++;
            return `![${alt}](./image-${idx}.png)`;
          },
        );
      }

      const fileName = `${lang}.${ext}`;
      const filePath = join(postDir, fileName);
      writeFileSync(filePath, frontmatter + body);

      // Copy images if provided
      if (content.images && content.images.length > 0) {
        content.images.forEach((img, i) => {
          const imgPath = join(postDir, `image-${i}.png`);
          writeFileSync(imgPath, img);
        });
      }

      // Git operations
      if (this.config.git_push) {
        execSync(`git add "${postDir}"`, { cwd: this.config.content_dir });
        execSync(`git commit -m "content: ${title}"`, { cwd: this.config.content_dir });
        execSync("git push", { cwd: this.config.content_dir });
      }

      // Deploy
      if (this.config.deploy_command) {
        execSync(this.config.deploy_command);
      }

      return [
        {
          platform: this.name,
          success: true,
          url: filePath,
          durationMs: Date.now() - start,
        },
      ];
    } catch (err) {
      return [
        {
          platform: this.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        },
      ];
    }
  }
}
