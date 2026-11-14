// DMD Viewer browser bridge. Upstream library: vpinball/pinmame (see README).
#include "src/libpinmame/libpinmame.h"
#include <emscripten/emscripten.h>
#include <atomic>
#include <mutex>
#include <vector>
#include <deque>
#include <string>
#include <cstring>
#include <cstdio>

static std::mutex lock;
static std::vector<unsigned char> frame;
static std::vector<unsigned char> triggerPlanes;
static int planeCount=0,planeSize=0;
static std::deque<float> audio;
static std::string logs, gameInfo;
static std::atomic<int> keys[105];
static int width=0,height=0,depth=0,channels=1;
static bool dirty=false;
static int rate=44100;
static bool externalInputs=false;
static void display(int,void* data,PinmameDisplayLayout* layout,void*) {
  if(!data || (layout->type&PINMAME_DISPLAY_TYPE_SEGMASK)!=PINMAME_DISPLAY_TYPE_DMD) return;
  if(layout->width<=0 || layout->height<=0 || layout->width*layout->height>65536) return;
  std::lock_guard<std::mutex> guard(lock);
  width=layout->width;height=layout->height;depth=layout->depth;
  const auto* p=static_cast<unsigned char*>(data);
  frame.assign(p,p+width*height);dirty=true;
}
static int audioStart(PinmameAudioInfo* info,void*) {
  std::lock_guard<std::mutex> guard(lock);
  channels=info->channels;rate=static_cast<int>(info->sampleRate);
  return info->samplesPerFrame;
}
static int audioUpdate(void* data,int samples,void*) {
  std::lock_guard<std::mutex> guard(lock);
  const auto* p=static_cast<float*>(data);
  for(int i=0;i<samples*channels;i++) audio.push_back(p[i]);
  while(audio.size()>static_cast<size_t>(rate*channels/2)) audio.pop_front();
  return samples;
}
static int key(PINMAME_KEYCODE code,void*) {return code>=0&&code<105?keys[code].load():0;}
static void logMessage(PINMAME_LOG_LEVEL,const char* format,va_list args,void*) {
  char text[2048];vsnprintf(text,sizeof(text),format,args);
  std::lock_guard<std::mutex> guard(lock);
  logs+=text;logs+='\n';if(logs.size()>16384)logs.erase(0,logs.size()-16384);
}
static void gameCallback(PinmameGame* game,void*) {
  gameInfo=std::string(game->description)+"\n"+(game->clone_of?game->clone_of:"");
}
static const char* auditName;
static std::string auditErrors;
static void auditRom(PinmameRom* rom,void*) {
  PinmameAuditGameRom(auditName,rom->name,1,rom);
  if(rom->state!=PINMAME_ROM_STATE_OK && rom->state!=PINMAME_ROM_STATE_NEED_REDUMP)
    auditErrors+=std::string(rom->name)+" (ROM audit state "+std::to_string(rom->state)+")\n";
}
extern "C" {
void viewer_capture_planes(const unsigned char* data,int count,int size) {
  std::lock_guard<std::mutex> guard(lock);
  planeCount=count;planeSize=size;triggerPlanes.assign(data,data+count*size);
  if(!frame.empty())dirty=true;
}
EMSCRIPTEN_KEEPALIVE void viewer_init() {
  PinmameConfig config={PINMAME_AUDIO_FORMAT_FLOAT,44100,"/pinmame/",nullptr,nullptr,display,audioStart,audioUpdate,nullptr,nullptr,nullptr,nullptr,key,logMessage,nullptr};
  PinmameSetConfig(&config);PinmameSetHandleKeyboard(1);PinmameSetHandleMechanics(0);
  PinmameSetDmdMode(PINMAME_DMD_MODE_RAW);
}
EMSCRIPTEN_KEEPALIVE int viewer_game(const char* name) {gameInfo.clear();return PinmameGetGame(name,gameCallback,nullptr);}
EMSCRIPTEN_KEEPALIVE const char* viewer_game_info() {return gameInfo.c_str();}
EMSCRIPTEN_KEEPALIVE const char* viewer_audit(const char* name) {auditName=name;auditErrors.clear();PinmameGetGameRoms(name,auditRom,nullptr);return auditErrors.c_str();}
EMSCRIPTEN_KEEPALIVE int viewer_run(const char* name) {externalInputs=strcmp(name,"pop_lx5")==0;PinmameSetHandleKeyboard(externalInputs?0:1);return PinmameRun(name);}
EMSCRIPTEN_KEEPALIVE int viewer_running() {return PinmameIsRunning();}
EMSCRIPTEN_KEEPALIVE void viewer_pause(int paused) {PinmamePause(paused);std::lock_guard<std::mutex> guard(lock);audio.clear();}
EMSCRIPTEN_KEEPALIVE void viewer_stop() {for(auto& k:keys)k=0;PinmameStop();std::lock_guard<std::mutex> guard(lock);audio.clear();}
EMSCRIPTEN_KEEPALIVE void viewer_reset() {PinmameReset();}
EMSCRIPTEN_KEEPALIVE void viewer_key(int code,int state) {
  if(externalInputs){
    int sw=code==31?1:code==32?2:code==33?5:code==34?6:code==35?7:code==26?8:code==27?13:0;
    if(sw)PinmameSetSwitch(sw,state);
    if(code==78&&state)PinmameSetSwitch(22,!PinmameGetSwitch(22));
  }else if(code>=0&&code<105)keys[code]=state;
}
EMSCRIPTEN_KEEPALIVE void viewer_switch(int number,int state) {PinmameSetSwitch(number,state);}
EMSCRIPTEN_KEEPALIVE int viewer_get_switch(int number) {return PinmameGetSwitch(number);}
EMSCRIPTEN_KEEPALIVE int viewer_solenoid(int number) {return PinmameGetSolenoid(number);}
EMSCRIPTEN_KEEPALIVE int viewer_frame(unsigned char* target,int* meta) {
  std::lock_guard<std::mutex> guard(lock);if(!dirty)return 0;
  memcpy(target,frame.data(),frame.size());memcpy(target+frame.size(),triggerPlanes.data(),triggerPlanes.size());
  meta[0]=width;meta[1]=height;meta[2]=depth;meta[3]=planeCount;meta[4]=planeSize;
  dirty=false;return frame.size()+triggerPlanes.size();
}
EMSCRIPTEN_KEEPALIVE int viewer_audio(float* target,int capacity,int* meta) {
  std::lock_guard<std::mutex> guard(lock);int n=static_cast<int>(audio.size());if(n>capacity)n=capacity;
  n-=n%channels;for(int i=0;i<n;i++){target[i]=audio.front();audio.pop_front();}meta[0]=channels;meta[1]=rate;return n;
}
EMSCRIPTEN_KEEPALIVE const char* viewer_logs() {
  static std::string copy;std::lock_guard<std::mutex> guard(lock);copy.swap(logs);logs.clear();return copy.c_str();
}
}
