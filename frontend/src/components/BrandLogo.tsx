import React from "react";

interface BrandLogoProps {
    size?: "sm" | "md" | "lg" | "xl";
    showTagline?: boolean;
    className?: string;
    imageOnly?: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ size = "md", showTagline = false, className = "", imageOnly = false }) => {
    const [imageFailed, setImageFailed] = React.useState(false);
    const sizeClasses = {
        sm: "text-lg",
        md: "text-2xl",
        lg: "text-4xl",
        xl: "text-6xl",
    };

    return (
        <div className={`flex flex-col items-start leading-none ${className}`}>
            <img
                src="/CloudVaathiLogo.png"
                alt="Cloud Vaathi"
                className="h-10 w-auto max-w-[260px] object-contain"
                onError={() => setImageFailed(true)}
            />
            {(imageOnly && !imageFailed) ? null : (
                <>
            <div className={`font-extrabold tracking-tight ${sizeClasses[size]} flex items-center`}>
                <span className="text-[#005EB8]">Cloud</span>
                <span className="text-[#87C232] ml-1">Vaathi</span>
            </div>
            {showTagline && (
                <span className={`text-[#87C232] font-semibold tracking-wider ${size === 'xl' ? 'text-xl mt-1' : 'text-[0.6rem] mt-0.5'}`}>
                    Learn Better. Build Faster.
                </span>
            )}
                </>
            )}
        </div>
    );
};

export default BrandLogo;
