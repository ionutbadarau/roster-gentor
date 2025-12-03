/** @type {import('next').NextConfig} */

const nextConfig = {
    images: {
        domains: ['images.unsplash.com'],
    },
    // Tempo platform configuration
    experimental: {
        allowedOrigins: process.env.TEMPO === "true" ? ["*"] : undefined
    }
};



module.exports = nextConfig;