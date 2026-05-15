/** @type {import('next').NextConfig} */

const nextConfig = {
    images: {
        domains: ['images.unsplash.com'],
    },
    // Tempo platform configuration
    experimental: {
        serverActions: process.env.TEMPO === "true" ? { allowedOrigins: ["*"] } : undefined
    }
};



module.exports = nextConfig;