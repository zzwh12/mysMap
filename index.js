import plugin from '../../lib/plugins/plugin.js';
import common from '../../lib/common/common.js';
import puppeteer from '../../lib/puppeteer/puppeteer.js';
import fetch from 'node-fetch';
import fs from 'node:fs';
import YAML from 'yaml';
import path from 'node:path';
import { exec } from 'child_process';
import { promisify } from 'util';
const mappath = './plugins/mysMap/images'
const url = 'https://ghproxy.ganyu.us.kg/https://github.com/win-syswow64/MysMap.git'
/** 此版本为修改版本 */
/** 原版本: https://gitee.com/HanaHimeUnica/yzjs/tree/mysMap */

const execPromise = promisify(exec);

export class MysMap extends plugin {
  constructor() {
    super({
      name: '米游社大地图',
      dsc: '找资源',
      event: 'message',
      priority: -999999999999,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*((提瓦特|渊下宫|层岩巨渊|地下矿区|旧(日之)?海)?((哪有|哪里有)(.+))|((.+)(在哪|在哪里|哪有|哪里有|位置|点位))(？|\\?)?)$',
          fnc: 'mysMap',
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(原神|米游社)?地图资源列表$',
          fnc: 'resList',
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(地图|找资源)帮助$',
          fnc: 'mapHelp',
        },
        {
          /** 命令正则匹配 */
          reg: '^#(强制)?地图资源(更新|下载)$',
            fnc: 'installOrUpdate',
            permission: 'master'
        },
      ],
    });
    
    /** 定时任务 */
    this.task = {
      cron: '0 0 0/6 * * ?',
      name: '更新米游社大地图资源',
      fnc: () => this.init()
    }
    this.path = './plugins/mysMap';
  }

  /** 安装或更新地图资源 */
  async installOrUpdate() {
    let cmd = ''
    if (!fs.existsSync(mappath) || this.e.msg.includes('下载')) {
      await this.reply('开始下载地图资源，资源包较大，请耐心等待')
      cmd = `git clone --depth=1 ${url} ${mappath}`
      exec(cmd, { cwd: process.cwd(), stdio: 'inherit' }, (error) => {
        if (error) { return this.reply(`下载错误：\n${error}`) } else {
          this.reply('地图资源下载完成')
        }
      })
    } else {
      await this.reply(`更新中，耐心等待，保存路径${mappath}`)
      cmd = 'git pull'
      if (this.e.msg.includes('强制')) { execSync('git fetch && git reset --hard', { cwd: mappath }) }
      exec(cmd, { cwd: mappath, stdio: 'inherit' }, (output, error) => {
        if (error) {
          if (error.match(/Already up to date\./)) { this.reply('当前地图资源已是最新') } else {
            this.reply('地图资源更新结束')
          }
        } else { return this.reply(`更新错误：${output}`) }
      })
    }
  }

  /** 初始化资源别称和图标 */
  async init() {
    await common.downFile(
      'https://api-static.mihoyo.com/common/map_user/ys_obc/v2/map/label/tree?map_id=2&app_sn=ys_obc&lang=zh-cn',
      `${this.path}/data/label.json`
    );
    MysMap.label_json = this.readJson(`${this.path}/data/label.json`);

    let name = this.readJson(`${this.path}/data/资源别称.yaml`, 'yaml') || {};
    let tree = MysMap.label_json?.data.tree;
    if (!tree) return;

    tree.forEach((val) => {
      val.children.forEach((v) => {
        name[v.id] ||= [v.name];

        let iconFile = `${this.path}/html/icon/${v.id}.png`;
        if (!fs.existsSync(iconFile)) {
          common.downFile(v.icon, iconFile);
        }
      });
    });
    this.writeJson(`${this.path}/data/资源别称.yaml`, name, 'yaml');
  }

  /** 查询地图资源 */
  async mysMap() {
    let { label, map } = this.filterMsg();

    if (!label.id) {
      await this.reply(`${map.name}没有找到资源「${label.name}」，可能米游社wiki未更新或不存在该资源\n发送【#地图资源列表】查看所有资源名称`);
      return;
    }

    let fileName;
    switch (map.id) {
      case 2:
        fileName = `teyvat_${label.name}.jpg`;
        break;
      case 7:
        fileName = `enkanomiya_${label.name}.jpg`;
        break;
      case 9:
        fileName = `chasm_${label.name}.jpg`;
        break;
      case 34:
        fileName = `sea_of_bygone_eras_${label.name}.jpg`;
        break;
      default:
        await this.reply(`${map.name}没有找到资源「${label.name}」，可能米游社wiki未更新或不存在该资源\n发送【#地图资源列表】查看所有资源名称`);
        return;
    }

    const filePath = `${this.path}/images/resource_data/${fileName}`;
    try {
      await this.reply([
        `※ ${label.name} 位置如下\n`,
        segment.image(`file://${filePath}`),
        `※ 数据来源于米游社wiki\n`,
        `※ 发送【地图帮助】查看说明`,
      ]);
    } catch (err) {
      await this.reply(`${map.name}没有找到资源「${label.name}」，可能米游社wiki未更新或不存在该资源\n发送【#地图资源列表】查看所有资源名称`);
    }
  }

  /** 资源列表展示 */
  async resList() {
    if (!fs.existsSync(`${this.path}/data/label.json`)) {
      await this.init(); // 如果没有label.json文件，则立即更新
    }

    MysMap.label_json ||= this.readJson(`${this.path}/data/label.json`);
    let tree = MysMap.label_json?.data.tree;
    if (!tree) return;

    let data = [];
    tree.forEach((val) => {
      let item = { title: val.name, list: [] };
      val.children.forEach((v) => {
        item.list.push({
          name: `#${v.id}<br><span>${v.name}</span>`,
          icon: path.resolve(`${this.path}/html/icon/${v.id}.png`), // 使用 path.resolve
        });
      });
      if (item.list.length > 0) {
        data.push(item);
      }
    });

    let img = await this.render({ data });
    await this.reply(img);
  }

  /** 帮助信息 */
  mapHelp() {
    let msg = '【#清心在哪|#旧海清心在哪】\n【#地图资源列表】全部资源名称';
    this.reply(msg);
  }

  /** 消息过滤处理 */
  filterMsg() {
    let reg = /＃|#|更新|提瓦特|渊下宫|层岩巨渊|地下矿区|旧(日之)?海|在|哪|里|有|位置|点位|？|\?/g;
    let msg = this.e.msg.replace(reg, '');

    let label = this.labelMap(msg) || { id: null, name: msg };
    let map = { id: 2, name: '提瓦特' };

    if (this.e.msg.includes('渊下')) {
      map = { id: 7, name: '渊下宫' };
    } else if (/层岩|矿区/.test(this.e.msg)) {
      map = { id: 9, name: '层岩巨渊' };
    } else if (/旧(日之)?海/.test(this.e.msg)) {
      map = { id: 34, name: '旧日之海' };
    }

    return { msg, label, map };
  }

  /** 别名映射 */
  labelMap(name) {
    let customName = this.readJson(`${this.path}/data/资源别称.yaml`, 'yaml') || {};
    let names = customName[name];

    if (names) return { name: names[0], id: name };

    for (let id in customName) {
      if (customName[id].includes(name)) return { name: customName[id][0], id };
    }
  }

  /** 渲染资源列表 */
  render(data = {}) {
    return puppeteer.screenshot('地图资源列表', {
      tplFile: `${this.path}/html/label.html`,
      imgType: 'jpeg',
      res: path.resolve(`${this.path}/html`), // 修改为 path.resolve
      quality: 100,
      ...data,
    });
  }

  /** 读取JSON/YAML文件 */
  readJson(file, format) {
    try {
      if (format == 'yaml') return YAML.parse(fs.readFileSync(file, 'utf8'));
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      return false;
    }
  }

  /** 写入JSON/YAML文件 */
  writeJson(savePath, data, format) {
    let content = format == 'yaml' ? YAML.stringify(data) : JSON.stringify(data, null, 2);
    return fs.writeFileSync(savePath, content);
  }
}
