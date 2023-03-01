const Discord = require('discord.js');
require('dotenv').config();
const token = process.env.token;
const mysql = require('mysql');
const cron = require("cron");
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_MEMBERS"] });
client.on('ready', readyDiscord);
client.on('messageCreate', gotMessage);

let con = mysql.createConnection({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database
});

function getLogsChannel(){
  let sql = "SELECT logsch FROM sysinfo";
  return new Promise((resolve, reject) => {
    con.query(sql, (err, result) => {
      if(err) reject(err)
      else resolve(result[0].logsch);
    });
  });
}

async function showDailyLogs(){
  let i, j, compareceu, chid;
  let modlist = [];
  chid = await getLogsChannel();
  const ch = client.channels.cache.find(channel => channel.id == chid);
  date = Date.now();
  date = new Date(date);
  day = date.getDate();
  month = date.getMonth();
  year = date.getFullYear();
  finaldate = year.toString() + '-' + (month + 1).toString() + '-' + day.toString();
  let sql = "SELECT * FROM historico WHERE dia = '" + finaldate + "' AND saiu = 1";
  compareceu = 0;
  con.query(sql, function(err, result){
    for(i = 0; i < result.length; i++){
      modlist.push(result[i].idUsuario);
    }
    ch.send('Compareceram ao turno de hoje: ');
    for(i = 0; i < modlist.length; i++) ch.send('<@' + modlist[i] + '>');
    ch.send('Não compareceram ao turno de hoje: ');
    let sql2 = "SELECT * FROM usuarios";
    con.query(sql2, function(err, result){
      for(i = 0; i < result.length; i++){
        compareceu = 0;
        for(j = 0; j < modlist.length; j++){
          if(result[i].id == modlist[j]) compareceu = 1;
        }
        if(compareceu == 0) ch.send('<@' + result[i].id + '>');
      }
    });
  });
}

function readyDiscord(){
  console.log('Bot rodando');
  let scheduledMessage = new cron.CronJob('00 58 23 * * *', () => {
    showDailyLogs();
  });
  scheduledMessage.start()
}

function getUser(id){
  let sql = "SELECT * FROM usuarios WHERE id = '" + id + "'";
  return new Promise((resolve, reject) => {
    con.query(sql, (err, result) => {
      if(err) reject(err)
      else resolve(result[0]);
    });
  });
}

function getTurns(id){
  let sql = "SELECT turnos.inicio, turnos.fim, turnos.id FROM usuariosTurnos INNER JOIN turnos WHERE turnos.id = usuariosTurnos.idTurno AND usuariosTurnos.idUsuario = '" + id + "'";
  return new Promise((resolve, reject) => {
    con.query(sql, (err, result) => {
      if(err) reject(err)
      else resolve(result);
    });
  });
}

function getLimit(){
  let sql = "SELECT limites FROM sysinfo";
  return new Promise((resolve, reject) => {
    con.query(sql, (err, result) => {
      if(err) reject(err)
      else resolve(result[0].limites);
    });
  });
}

function getChannel(){
  let sql = "SELECT defaultch FROM sysinfo";
  return new Promise((resolve, reject) => {
    con.query(sql, (err, result) => {
      if(err) reject(err)
      else resolve(result[0].defaultch);
    });
  });
}

function isOnTime(turn, limit, date){
  let hours, minutes, finalstamp, turnstamp;
  turn = turn.split(':');
  hours = date.getHours();
  minutes = date.getMinutes();
  finalstamp = minutes + (hours * 60);
  turnstamp = parseInt(turn[1]) + (parseInt(turn[0]) * 60);
  if(finalstamp >= (turnstamp - limit) && finalstamp <= (turnstamp + limit)) return true;
  else return false;
}

function insertLog(user, turn, date, msg){
  let sql2 = "SELECT id FROM historico WHERE idUsuario = '" + user + "' AND idTurno = " + turn.id + " AND entrou = 1";
  con.query(sql2, function(err, result){
    if(result.length == 0){
      day = date.getDate();
      month = date.getMonth();
      year = date.getFullYear();
      finaldate = year.toString() + '-' + (month + 1).toString() + '-' + day.toString();
      let sql = "INSERT INTO historico(idusuario, idTurno, entrou, dia) VALUES('" + user + "', " + turn.id + ", 1, '" + finaldate + "')";
      con.query(sql, function(err, result){
        msg.react('✅');
      });
    }else{
      msg.react('❌');
    }
  });
}

function changeLog(user, turn, date, msg){
  day = date.getDate();
  month = date.getMonth();
  year = date.getFullYear();
  finaldate = year.toString() + '-' + (month + 1).toString() + '-' + day.toString();
  let sql = "SELECT id FROM historico WHERE idUsuario = '" + user + "' AND idTurno = " + turn.id + " AND entrou = 1";
  con.query(sql, function(err, result){
    if(result.length > 0){
      let sql2 = "UPDATE historico SET saiu = 1 WHERE id = " + result[0].id;
      con.query(sql2, function(err, result){
        msg.react('✅');
      });
    }else{
      msg.react('❌');
    }
  });
}

function validateOn(user, turns, limit, date, msg){
  let i;
  let ontime = false;
  for(i = 0; i < turns.length; i++){
    if(isOnTime(turns[i].inicio, limit, date)){
      ontime = true;
      insertLog(user, turns[i], date, msg);
    }
  }
  if(!ontime) msg.react('❌');
}

function validateOff(user, turns, limit, date, msg){
  let i;
  let ontime = false;
  for(i = 0; i < turns.length; i++){
    if(isOnTime(turns[i].fim, limit, date)){
      ontime = true;
      changeLog(user, turns[i], date, msg);
    }
  }
  if(!ontime) msg.react('❌');
}

function setChannel(msg){
  content = msg.content;
  content = content.split(' ');
  if(content.length != 2) return;
  content = content[1];
  const ch = client.channels.cache.find(channel => channel.id == content);
  if(ch == undefined) return;
  let sql = "UPDATE sysinfo SET defaultch = '" + content + "' WHERE id = 1";
  con.query(sql, function(err, result){
    msg.react('✅');
  });
}

function setLogsChannel(msg){
  content = msg.content;
  content = content.split(' ');
  if(content.length != 2) return;
  content = content[1];
  const ch = client.channels.cache.find(channel => channel.id == content);
  if(ch == undefined) return;
  let sql = "UPDATE sysinfo SET logsch = '" + content + "' WHERE id = 1";
  con.query(sql, function(err, result){
    msg.react('✅');
  });
}

function addUser(msg){
  let date, year, month, day, finaldate;
  content = msg.content;
  content = content.split(' ');
  if(content.length != 2) return;
  content = content[1];
  let user = client.users.cache.find(user => user.id == content);
  //if(user == undefined) return;
  let sql = "SELECT * FROM usuarios WHERE id = '" + content + "'";
  con.query(sql, function(err, result){
    if(result.length == 0){
      date = Date.now();
      date = new Date(date);
      year = date.getFullYear();
      month = date.getMonth() + 1;
      day = date.getDate();
      finaldate = year.toString() + '-' + month.toString() + '-' + day.toString();
      let sql2 = "INSERT INTO usuarios(id, registerdate) VALUES('" + content + "', '" + finaldate + "')";
      con.query(sql2, function(err, result){
        msg.react('✅');
      });
    }
  });
}

function showCommands(msg){
  let i, commands;
  commands = [];
  commands.push('alb!setch id: Setar canal onde os mods marcam presença');
  commands.push('alb!setlogsch id: Setar canal onde os logs diários dos mods serão mostrados');
  commands.push('alb!adduser id: Registrar um moderador no bot');
  commands.push('alb!addturn idMod HH:MM-HH:MM : Adicionar um turno a um moderador');
  for(i = 0; i < commands.length; i++){
    msg.channel.send(commands[i]);
  }
}

function addTurn(msg){
  let user, turn, sql, sql2, sql3, turnid;
  content = msg.content.split(' ');
  user = content[1];
  turn = content[2].split('-')[0];
  if(content.length != 3) return;
  sql = "SELECT * FROM usuarios WHERE id = '" + user + "'";
  con.query(sql, function(err, result){
    if(result.length > 0){
      sql2 = "SELECT * from turnos WHERE inicio = '" + turn + "'";
      con.query(sql2, function(err, result2){
        if(result2.length > 0){
          turnid = result2[0].id;
          sql3 = "INSERT INTO usuariosTurnos(idUsuario, idTurno) VALUES('" + user + "', " + turnid + ")";
          con.query(sql3, function(err, result){
            msg.react('✅');
          })
        }
      });
    }
  });
}

async function gotMessage(msg){
  if(msg.author.bot) return;
  let userid, user, turns, timestamp, date, limit;
  userid = msg.author.id;
  limit = await getLimit();
  channel = await getChannel();
  user = await getUser(userid);
  turns = await getTurns(userid);
  timestamp = Date.now();
  date = new Date(timestamp);
  if(user == undefined || turns == undefined) return;
  if(msg.channel.id == channel){
    if(msg.content.toLowerCase() == 'on') validateOn(userid, turns, limit, date, msg);
    else if(msg.content.toLowerCase() == 'off') validateOff(userid, turns, limit, date, msg);
  }
  //Permissions to use the bot
  if(userid == '452328082666160138' || userid == '287647423302598656'){
    if(msg.content.toLowerCase().startsWith('alb!setch')) setChannel(msg);
    if(msg.content.toLowerCase().startsWith('alb!setlogsch')) setLogsChannel(msg);
    if(msg.content.toLowerCase().startsWith('alb!adduser')) addUser(msg);
    //if(msg.content.toLowerCase().startsWith('alb!showstats')) showStats(msg);
    //if(msg.content.toLowerCase().startsWith('alb!resetuser')) resetUser(msg);
    //if(msg.content.toLowerCase().startsWith('alb!turnreset')) turnReset(msg);
    if(msg.content.toLowerCase().startsWith('alb!addturn')) addTurn(msg);
    if(msg.content.toLowerCase().startsWith('alb!help')) showCommands(msg);
    if(msg.content.toLowerCase().startsWith('alb!showlogs')) showDailyLogs()
  }
}

client.login(token);