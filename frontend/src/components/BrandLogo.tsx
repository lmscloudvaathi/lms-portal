import React from "react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  className?: string;
  imageOnly?: boolean;
}

const sizeMap = {
  sm: { img: "h-10 w-10", title: "text-base", tag: "text-[10px]" },
  md: { img: "h-10 w-10", title: "text-lg", tag: "text-[10px]" },
  lg: { img: "h-12 w-12", title: "text-2xl", tag: "text-xs" },
  xl: { img: "h-14 w-14", title: "text-3xl", tag: "text-sm" },
};

const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  showTagline = false,
  className = "",
  imageOnly = false,
}) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const s = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 leading-none ${className}`}>
      {!imageFailed && (
        <img
          src="/CloudVaathiLogo.png"
          alt="Cloud Vaathi"
          className={`${s.img} shrink-0 rounded-lg object-contain`}
          onError={() => setImageFailed(true)}
        />
      )}
      {!imageOnly && (
        <div className="flex flex-col leading-none">
          <span className={`font-display font-bold tracking-tight text-foreground ${s.title}`}>
            Cloud Vaathi
          </span>
          {showTagline && (
            <span className={`font-mono uppercase tracking-[0.18em] text-muted-foreground mt-1 ${s.tag}`}>
              Learn - Certify - Transform
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default BrandLogo;
