// zip.js
const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

// 将 dist 文件夹添加到压缩包
const distPath = path.join(__dirname, '../dist')

// 在dist文件夹写一个version.txt文件，内容为版本号
const packageJson = fs.readFileSync(
    path.join(__dirname, '../package.json'),
    'utf-8'
)
const versionObj = JSON.parse(packageJson)
// 当前时间
const now = new Date().toISOString()

const content =
    'version: ' + versionObj.version + '\n' + 'build time: ' + now + '\n'
console.log('version.txt content', content)

fs.writeFileSync(path.join(distPath, 'version.txt'), content)

// 输出 zip 文件路径
const outputPath = path.join(__dirname, `${versionObj.version}.zip`)
const output = fs.createWriteStream(outputPath)

// 初始化 zip 压缩流
const archive = archiver('zip', {
    zlib: { level: 9 }, // 压缩等级，0-9，越大压缩越慢体积越小
})

// 监听完成
output.on('close', () => {
    console.log(`✅ 压缩完成: ${archive.pointer()} 字节`)
    console.log(`📦 文件保存到: ${outputPath}`)
    // 将 dist.zip 文件移动到 dist 文件夹
    fs.renameSync(
        outputPath,
        path.join(__dirname, `../dist/${versionObj.version}.zip`)
    )
})

// 错误监听
archive.on('error', (err) => {
    console.log(`❌ 压缩失败: ${err}`)
    throw err
})

// 连接输出流
archive.pipe(output)

// 将 docs 文件夹添加到压缩包
archive.directory(distPath, false)

// 完成归档
archive.finalize()
