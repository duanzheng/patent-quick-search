// An antialiased transparent search mark. macOS treats its alpha as a template;
// the same dark-neutral mark is used on other platforms without a square tile.
pub fn rgba(size: u32) -> Vec<u8> {
    let mut image = vec![0; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let mut covered = 0;
            for sy in 0..4 {
                for sx in 0..4 {
                    let px = (x as f64 + (sx as f64 + 0.5) / 4.0) * 18.0 / size as f64;
                    let py = (y as f64 + (sy as f64 + 0.5) / 4.0) * 18.0 / size as f64;
                    let ring =
                        (((px - 7.5).powi(2) + (py - 7.5).powi(2)).sqrt() - 4.75).abs() < 0.85;
                    let line = |ax: f64, ay: f64, bx: f64, by: f64, width: f64| {
                        let dx = bx - ax;
                        let dy = by - ay;
                        let t = (((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
                            .clamp(0.0, 1.0);
                        ((px - ax - t * dx).powi(2) + (py - ay - t * dy).powi(2)).sqrt() < width
                    };
                    if ring
                        || line(11.0, 11.0, 15.3, 15.3, 0.95)
                        || line(5.8, 6.5, 9.0, 6.5, 0.55)
                        || line(5.8, 8.6, 8.0, 8.6, 0.55)
                    {
                        covered += 1;
                    }
                }
            }
            let i = ((y * size + x) * 4) as usize;
            image[i] = 32;
            image[i + 1] = 32;
            image[i + 2] = 32;
            image[i + 3] = (covered * 255 / 16) as u8;
        }
    }
    image
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transparent_monochrome_mark_is_sharp_at_standard_and_retina_sizes() {
        for size in [18, 36, 54] {
            let p = rgba(size);
            assert_eq!(p.len(), (size * size * 4) as usize);
            assert!(p.chunks_exact(4).all(|v| v[0] == v[1] && v[1] == v[2]));
            let occupied = p.chunks_exact(4).filter(|v| v[3] > 0).count();
            assert!(
                occupied > size as usize * size as usize / 5
                    && occupied < size as usize * size as usize / 2
            );
            assert_eq!(p[3], 0);
            assert!(p.chunks_exact(4).any(|v| v[3] > 0 && v[3] < 255));
        }
    }
}
