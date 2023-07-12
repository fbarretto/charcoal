import type React from "react";

import "./BannerNotice.scss";

export function BannerNotice({
  title,
  description,
  buttons,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  buttons?: Array<React.ReactNode>;
}) {
  return (
    <div className="banner-notice">
      <div className="banner-notice-left">
        <div className="banner-notice-content">
          <span className="banner-notice-title">{title}</span>
          <span className="banner-notice-byline">{description}</span>
        </div>
      </div>
      {buttons ? <div className="error-notice-buttons">{buttons}</div> : null}
    </div>
  );
}
